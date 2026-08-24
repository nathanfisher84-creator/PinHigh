"use server";

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { readWorkbook, pickStockSheet, SpreadsheetError } from "@/lib/xlsx/read";
import { parseStockSheet, MAX_BYTES, MAX_ROWS } from "@/lib/import/parse";
import {
  buildDiff,
  commitImport,
  summariseDiff,
  type ImportMode,
  type StockDiff,
} from "@/lib/import/commit";
import { FIELDS, type FieldKey } from "@/lib/import/columns";
import { all, run, now } from "@/lib/db";

/**
 * Stock import server actions (spec §4.2).
 *
 * The uploaded file is written to disk and referenced by an opaque token, then
 * re-parsed on commit. Two reasons: the preview and the commit must be reading
 * exactly the same bytes, and §4.2 step 1 puts the file in storage anyway so
 * `stock_imports` has something to point at.
 */

const UPLOAD_DIR = path.join(
  process.env.PINHIGH_DATA_DIR ?? path.join(process.cwd(), ".data"),
  "uploads",
);

async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  return session.email;
}

export interface PreviewResult {
  ok: boolean;
  token?: string;
  filename?: string;
  /** Present when required columns could not be matched — show the mapper. */
  needsMapping?: {
    headers: string[];
    missing: { key: FieldKey; canonical: string; help: string }[];
    matched: Record<string, number>;
  };
  diff?: StockDiff;
  summary?: string;
  message?: string;
  sheetName?: string;
  inferred?: { key: string; header: string }[];
  ignored?: string[];
  /** Which file shape this was read as. */
  source?: "template" | "adidas" | "adidas-order";
  /** adidas implementation file: sales orders covered. */
  orderNumbers?: string[];
  /** adidas implementation file: articles with nothing shipped yet. */
  awaitingDelivery?: string[];
  /** adidas: invoice numbers in this file. */
  invoices?: string[];
  /** adidas: invoices already applied, which would double-count stock. */
  alreadyApplied?: string[];
  /** adidas: articles that will arrive without a name or colour. */
  needingDetails?: string[];
  /** Retail RRP in AED from the file, labelled retail not wholesale. */
  articleRrp?: { article_number: string; style_name: string; colour: string; rrp: number }[];
}

/** Saved manual mappings, reused on later uploads (§4.1). */
async function savedMappings(): Promise<Record<string, FieldKey>> {
  const rows = await all<{ header: string; field_key: string }>(
    "SELECT header, field_key FROM column_mappings",
  );
  return Object.fromEntries(rows.map((r) => [r.header, r.field_key as FieldKey]));
}

export async function previewStockFile(formData: FormData): Promise<PreviewResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
        MAX_BYTES / 1024 / 1024
      } MB — split it and upload in two parts.`,
    };
  }

  const mode = (String(formData.get("mode") ?? "upsert") as ImportMode) ?? "upsert";

  // A manual mapping submitted from the column-mapper, as field -> column index.
  let overrideMap: Partial<Record<FieldKey, number>> | undefined;
  const rawOverride = formData.get("mapping");
  if (typeof rawOverride === "string" && rawOverride) {
    try {
      overrideMap = JSON.parse(rawOverride);
    } catch {
      overrideMap = undefined;
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let sheetName = "";
  let parsed;
  try {
    const workbook = readWorkbook(buffer, file.name);
    const sheet = pickStockSheet(workbook);
    sheetName = sheet.name;

    if (sheet.rows.length > MAX_ROWS + 50) {
      return {
        ok: false,
        message: `That sheet has more than ${MAX_ROWS.toLocaleString()} rows. Split it and upload in two parts.`,
      };
    }

    parsed = (await parseStockSheet(sheet.rows, {
      savedMap: await savedMappings(),
      overrideMap,
    }));
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof SpreadsheetError
          ? err.message
          : "That file couldn't be read. Save it as .xlsx from Excel and try again.",
    };
  }

  /* -- Columns we could not match: offer the manual mapper (§4.1) -------- */
  if (parsed.header.missingRequired.length > 0) {
    return {
      ok: false,
      needsMapping: {
        headers: parsed.header.headers,
        missing: parsed.header.missingRequired.map((key) => {
          const field = FIELDS.find((f) => f.key === key)!;
          return { key, canonical: field.canonical, help: field.help };
        }),
        matched: Object.fromEntries(
          Object.entries(parsed.header.map).filter(([, v]) => v !== undefined),
        ) as Record<string, number>,
      },
      message:
        "We couldn't work out which columns hold some of the required fields. Point them at the right ones below.",
      sheetName,
    };
  }

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      message:
        "No usable rows were found in that file. Check the Stock tab has data below the header row.",
      sheetName,
    };
  }

  // Persist the exact bytes the preview was built from.
  await mkdir(UPLOAD_DIR, { recursive: true });
  const token = randomUUID();
  const stored = `${token}${path.extname(file.name).toLowerCase() || ".xlsx"}`;
  await writeFile(path.join(UPLOAD_DIR, stored), buffer);

  const diff = await buildDiff(parsed.rows, mode, parsed.issues, parsed.rowsRead, parsed.rowsFailed);

  /*
   * An adidas file is an invoice, so applying it twice would count the same
   * delivery into stock twice. Every invoice number this import has already
   * seen is recorded, and a repeat is surfaced before the owner commits.
   */
  const invoices = parsed.billingDocuments ?? [];
  const alreadyApplied: string[] = [];
  if (invoices.length > 0) {
    const seen = await all<{ invoice_refs: string | null }>(
      "SELECT invoice_refs FROM stock_imports WHERE status = 'committed' AND invoice_refs IS NOT NULL",
    );
    const applied = new Set<string>();
    for (const r of seen) {
      try {
        for (const ref of JSON.parse(r.invoice_refs ?? "[]") as string[]) applied.add(ref);
      } catch {
        /* ignore a malformed record rather than block the import */
      }
    }
    for (const inv of invoices) if (applied.has(inv)) alreadyApplied.push(inv);
  }

  const needingDetails = [
    ...new Set(parsed.rows.filter((r) => r.needs_review).map((r) => r.article_number)),
  ];

  const articleRrp: NonNullable<PreviewResult["articleRrp"]> = [];
  const seenRrp = new Set<string>();
  for (const row of parsed.rows) {
    if (row.rrp === null || seenRrp.has(row.article_number)) continue;
    seenRrp.add(row.article_number);
    articleRrp.push({
      article_number: row.article_number,
      style_name: row.style_name,
      colour: row.colour,
      rrp: row.rrp,
    });
  }

  return {
    ok: true,
    token: stored,
    filename: file.name,
    diff,
    source: parsed.source ?? "template",
    orderNumbers: parsed.orderNumbers ?? [],
    awaitingDelivery: parsed.awaitingDelivery ?? [],
    invoices,
    alreadyApplied,
    needingDetails,
    articleRrp,
    summary: (await summariseDiff(diff)),
    sheetName,
    inferred: parsed.header.inferred,
    ignored: parsed.header.unmatched.map((u) => u.header),
  };
}

export interface CommitResultPayload {
  ok: boolean;
  message: string;
  importId?: string;
}

export async function commitStockFile(
  token: string,
  filename: string,
  mode: ImportMode,
  confirmation: string,
  mappingJson?: string,
): Promise<CommitResultPayload> {
  const actor = await requireAdmin();

  // Full replace requires typing REPLACE (§4.2 step 4). Checked server-side —
  // this is the one action in the admin panel that can take the catalogue down.
  if (mode === "replace" && confirmation.trim().toUpperCase() !== "REPLACE") {
    return { ok: false, message: "Type REPLACE to confirm a full replace." };
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(token));
  if (!existsSync(filePath)) {
    return {
      ok: false,
      message: "That upload has expired. Upload the file again.",
    };
  }

  let overrideMap: Partial<Record<FieldKey, number>> | undefined;
  if (mappingJson) {
    try {
      overrideMap = JSON.parse(mappingJson);
    } catch {
      overrideMap = undefined;
    }
  }

  try {
    const buffer = await readFile(filePath);
    const workbook = readWorkbook(buffer, filename);
    const sheet = pickStockSheet(workbook);
    const parsed = (await parseStockSheet(sheet.rows, {
      savedMap: await savedMappings(),
      overrideMap,
    }));

    if (parsed.rows.length === 0) {
      return { ok: false, message: "Nothing importable was found in that file." };
    }

    // Rebuild the diff against current data rather than trusting the one the
    // browser is holding — the catalogue may have changed since the preview.
    const diff = await buildDiff(parsed.rows, mode, parsed.issues, parsed.rowsRead, parsed.rowsFailed);

    const invoices = parsed.billingDocuments ?? [];
    const orders = parsed.orderNumbers ?? [];

    // Refuse to count a delivery twice unless the owner has said so explicitly.
    if (mode === "add" && invoices.length > 0 && confirmation !== "APPLY-AGAIN") {
      const seen = await all<{ invoice_refs: string | null }>(
        "SELECT invoice_refs FROM stock_imports WHERE status = 'committed' AND invoice_refs IS NOT NULL",
      );
      const applied = new Set<string>();
      for (const r of seen) {
        try {
          for (const ref of JSON.parse(r.invoice_refs ?? "[]") as string[]) applied.add(ref);
        } catch {
          /* ignore */
        }
      }
      const repeat = invoices.filter((i) => applied.has(i));
      if (repeat.length > 0) {
        return {
          ok: false,
          message: `Invoice ${repeat.join(", ")} has already been added to stock. Adding it again would count the same delivery twice.`,
        };
      }
    }

    const result = (await commitImport(parsed.rows, mode, diff, {
      filename,
      storagePath: token,
      uploadedBy: actor,
      invoiceRefs: invoices,
      orderRefs: orders,
    }));

    // Remember any manual mapping so the owner maps an odd column once (§4.1).
    if (overrideMap) {
      for (const [key, index] of Object.entries(overrideMap)) {
        const header = parsed.header.headers[index as number];
        if (!header) continue;
        await run(
          `INSERT INTO column_mappings (header, field_key, updated_at) VALUES (?,?,?)
           ON CONFLICT(header) DO UPDATE SET field_key = excluded.field_key,
                                            updated_at = excluded.updated_at`,
          header.toLowerCase().replace(/[^a-z0-9]/g, ""),
          key,
          now(),
        );
      }
    }

    revalidatePath("/admin/stock");
    revalidatePath("/admin");
    revalidatePath("/catalogue");
    revalidatePath("/");

    return {
      ok: true,
      importId: result.importId,
      message: `Done. ${result.rowsUpdated} SKUs updated, ${result.rowsCreated} added${
        result.rowsZeroed ? `, ${result.rowsZeroed} set to zero` : ""
      }.`,
    };
  } catch (err) {
    console.error("[pinhigh] stock commit failed:", err);
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Nothing was changed. ${err.message}`
          : "Nothing was changed — that import failed.",
    };
  }
}
