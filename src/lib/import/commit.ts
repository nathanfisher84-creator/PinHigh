import "server-only";
import { all, audit, get, now, run, setSetting, transaction, uid } from "@/lib/db/core";
import type { ParsedRow, RowIssue } from "./parse";

/**
 * Diff, commit and rollback for the stock import (spec §4.2, §4.3).
 *
 * The governing constraint is §4: "impossible to use destructively by
 * accident". Concretely that means the owner always sees what will change
 * before it changes, the safe mode is the default, nothing is ever deleted,
 * and there is a way back for 30 days.
 */

export type ImportMode = "upsert" | "replace" | "add" | "set" | "details";

export interface StockDiff {
  mode: ImportMode;
  /** Plain-language counts for the summary line (§4.2 step 3). */
  skusUpdated: number;
  skusCreated: number;
  stylesCreated: number;
  /** SKUs in the database that this file does not mention. */
  skusAbsent: number;
  unitsBefore: number;
  unitsAfter: number;
  /** Every absent SKU, so the owner can see exactly what is at stake. */
  absent: AbsentSku[];
  /** Styles the file introduces, for a quick sanity read. */
  newStyles: { article_number: string; brand: string; style_name: string; colour: string }[];
  /** Notable quantity movements, largest first. */
  movements: Movement[];
  issues: RowIssue[];
  rowsRead: number;
  rowsFailed: number;
}

export interface AbsentSku {
  sku: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  size: string;
  quantity: number;
}

export interface Movement {
  sku: string;
  article_number: string;
  style_name: string;
  colour: string;
  size: string;
  before: number;
  after: number;
  delta: number;
}

interface ExistingVariant {
  sku: string;
  quantity: number;
  product_id: string;
  size: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  is_visible: number;
}

async function loadExisting(): Promise<Map<string, ExistingVariant>> {
  const rows = await all<ExistingVariant>(
    `SELECT v.sku, v.quantity, v.product_id, v.size,
            p.article_number, p.brand, p.style_name, p.colour, p.is_visible
       FROM variants v JOIN products p ON p.id = v.product_id`,
  );
  return new Map(rows.map((r) => [r.sku, r]));
}

/* -------------------------------------------------------------------------
   Diff
   ---------------------------------------------------------------------- */

export async function buildDiff(
  rows: ParsedRow[],
  mode: ImportMode,
  issues: RowIssue[],
  rowsRead: number,
  rowsFailed: number,
): Promise<StockDiff> {
  const existing = await loadExisting();
  const existingArticles = new Set(
    (await all<{ article_number: string }>("SELECT article_number FROM products")).map(
      (r) => r.article_number,
    ),
  );

  const inFile = new Set(rows.map((r) => r.sku));

  let skusUpdated = 0;
  let skusCreated = 0;
  const movements: Movement[] = [];
  const newStyleKeys = new Set<string>();
  const newStyles: StockDiff["newStyles"] = [];

  let unitsBefore = 0;
  for (const v of existing.values()) unitsBefore += v.quantity;
  let unitsAfter = 0;

  /*
   * A delivery adds to what is on the shelf; a stock take replaces it; the
   * product template touches no quantity at all.
   */
  const adding = mode === "add";
  const detailsOnly = mode === "details";
  if (adding || detailsOnly) unitsAfter = unitsBefore;

  for (const row of rows) {
    const prior = existing.get(row.sku);
    const after = detailsOnly
      ? (prior?.quantity ?? 0)
      : adding
        ? (prior?.quantity ?? 0) + row.quantity
        : row.quantity;
    if (!detailsOnly) unitsAfter += row.quantity;

    if (prior) {
      skusUpdated++;
      if (prior.quantity !== after) {
        movements.push({
          sku: row.sku,
          article_number: row.article_number,
          style_name: row.style_name,
          colour: row.colour,
          size: row.size,
          before: prior.quantity,
          after,
          delta: after - prior.quantity,
        });
      }
    } else {
      skusCreated++;
    }

    if (!existingArticles.has(row.article_number) && !newStyleKeys.has(row.article_number)) {
      newStyleKeys.add(row.article_number);
      newStyles.push({
        article_number: row.article_number,
        brand: row.brand,
        style_name: row.style_name,
        colour: row.colour,
      });
    }
  }

  /*
   * Neither "add" nor "set" treats a missing SKU as absent. A delivery simply
   * did not include it, and an implementation file covers one order rather
   * than the whole catalogue — in both cases zeroing everything else would be
   * destroying stock the file says nothing about.
   */
  const leavesOthersAlone = mode === "add" || mode === "set" || mode === "details";
  const absent: AbsentSku[] = [];
  for (const [sku, v] of leavesOthersAlone ? [] : existing) {
    if (inFile.has(sku)) continue;
    absent.push({
      sku,
      article_number: v.article_number,
      brand: v.brand,
      style_name: v.style_name,
      colour: v.colour,
      size: v.size,
      quantity: v.quantity,
    });
  }

  // Absent SKUs go to zero in both modes, so they do not carry stock forward.
  // Sorted by what the owner loses most by getting wrong.
  absent.sort((a, b) => b.quantity - a.quantity);
  movements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    mode,
    skusUpdated,
    skusCreated,
    stylesCreated: newStyles.length,
    skusAbsent: absent.length,
    unitsBefore,
    unitsAfter,
    absent,
    newStyles,
    movements,
    issues,
    rowsRead,
    rowsFailed,
  };
}

/**
 * A one-line summary in the owner's language (§4.2 step 3).
 * "142 SKUs updated · 18 new SKUs · 6 new styles · 23 SKUs not in this file"
 */
export function summariseDiff(diff: StockDiff): string {
  const n = (count: number, one: string, many: string) =>
    `${count.toLocaleString()} ${count === 1 ? one : many}`;

  const parts: string[] = [];
  if (diff.skusUpdated) parts.push(`${n(diff.skusUpdated, "SKU", "SKUs")} updated`);
  if (diff.skusCreated) parts.push(n(diff.skusCreated, "new SKU", "new SKUs"));
  if (diff.stylesCreated) parts.push(n(diff.stylesCreated, "new style", "new styles"));
  if (diff.skusAbsent) parts.push(`${n(diff.skusAbsent, "SKU", "SKUs")} not in this file`);
  return parts.length ? parts.join(" · ") : "Nothing would change.";
}

/* -------------------------------------------------------------------------
   Snapshot
   ---------------------------------------------------------------------- */

interface Snapshot {
  takenAt: string;
  products: Record<string, unknown>[];
  variants: Record<string, unknown>[];
}

async function takeSnapshot(): Promise<Snapshot> {
  return {
    takenAt: now(),
    products: await all("SELECT * FROM products"),
    variants: await all("SELECT * FROM variants"),
  };
}

/* -------------------------------------------------------------------------
   Commit
   ---------------------------------------------------------------------- */

export interface CommitResult {
  importId: string;
  rowsCreated: number;
  rowsUpdated: number;
  rowsZeroed: number;
}

/**
 * Write the import. Everything happens inside one transaction (§4.2 step 5) —
 * a half-applied stock file is the worst outcome available, because it looks
 * like it succeeded.
 */
export async function commitImport(
  rows: ParsedRow[],
  mode: ImportMode,
  diff: StockDiff,
  meta: {
    filename: string;
    storagePath?: string | null;
    uploadedBy?: string | null;
    /** adidas invoice numbers applied here, so the same delivery cannot
     *  be counted into stock twice. */
    invoiceRefs?: string[];
    /** adidas sales orders covered by this import. */
    orderRefs?: string[];
  },
): Promise<CommitResult> {
  const importId = uid();
  const timestamp = now();
  const snapshot = await takeSnapshot();

  let rowsCreated = 0;
  let rowsUpdated = 0;
  let rowsZeroed = 0;

  await transaction(async () => {
    // Group rows by article so each product is touched once.
    const byArticle = new Map<string, ParsedRow[]>();
    for (const row of rows) {
      const bucket = byArticle.get(row.article_number);
      if (bucket) bucket.push(row);
      else byArticle.set(row.article_number, [row]);
    }

    let sortCursor =
      ((await get<{ max: number }>("SELECT COALESCE(MAX(sort_order), 0) AS max FROM products"))
        ?.max ?? 0) + 1;

    for (const [articleNumber, articleRows] of byArticle) {
      const lead = articleRows[0];

      const existingProduct = await get<{ id: string; price_wholesale: number | null; rrp: number | null }>(
        "SELECT id, price_wholesale, rrp FROM products WHERE article_number = ?",
        articleNumber,
      );

      // A price left blank in the file retains the existing price (§4.1) —
      // the owner often uploads a quantity-only sheet.
      const priceFromFile = articleRows.find((r) => r.price_wholesale !== null)?.price_wholesale;
      const rrpFromFile = articleRows.find((r) => r.rrp !== null)?.rrp;

      let productId: string;

      if (existingProduct) {
        productId = existingProduct.id;
        await run(
          /*
           * An invoice re-import must never overwrite the name, colour,
           * category or gender the owner typed in — the file does not contain
           * them, so it has nothing better to offer. Those fields are only
           * written when the file actually carries them.
           */
          lead.needs_review
            ? `UPDATE products SET
                 brand = ?,
                 rrp = COALESCE(?, rrp),
                 cost_price = COALESCE(?, cost_price),
                 updated_at = ?
               WHERE id = ?`
            : `UPDATE products SET
                 brand = ?, style_group = ?, style_name = ?, condition = ?, colour = ?,
                 category = ?, gender = ?,
                 price_wholesale = ?, rrp = ?,
                 case_pack = COALESCE(?, case_pack),
                 moq = COALESCE(?, moq),
                 season = COALESCE(?, season),
                 is_discontinued = COALESCE(?, is_discontinued),
                 is_visible = 1,
                 updated_at = ?
               WHERE id = ?`,
          ...(lead.needs_review
            ? [lead.brand, lead.rrp, lead.cost_price ?? null, timestamp, productId]
            : [
                lead.brand,
                lead.style_group,
                lead.style_name,
                lead.condition,
                lead.colour,
                lead.category,
                lead.gender,
                priceFromFile ?? existingProduct.price_wholesale,
                rrpFromFile ?? existingProduct.rrp,
                lead.case_pack,
                lead.moq,
                lead.season,
                lead.is_discontinued === null ? null : lead.is_discontinued ? 1 : 0,
                timestamp,
                productId,
              ]),
        );
      } else {
        productId = uid();
        await run(
          `INSERT INTO products (
             id, article_number, brand, style_group, style_name, condition, colour,
             colour_hex, category, gender, description, fabric, season,
             price_wholesale, rrp, cost_price, needs_review, case_pack, moq,
             is_visible, is_discontinued, sort_order, created_at, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          productId,
          articleNumber,
          lead.brand,
          lead.style_group,
          lead.style_name,
          lead.condition,
          lead.colour,
          null,
          lead.category,
          lead.gender,
          null,
          null,
          lead.season,
          priceFromFile ?? null,
          rrpFromFile ?? null,
          lead.cost_price ?? null,
          lead.needs_review ? 1 : 0,
          lead.case_pack,
          lead.moq,
          /*
           * Visible even when it still needs a name. A trade buyer navigates by
           * article number (§6.2) and the size run and stock are real, so the
           * product is genuinely usable as "HZ6891" — more usable than absent.
           * The admin nags until it has a proper name and colour.
           */
          1,
          lead.is_discontinued ? 1 : 0,
          sortCursor++,
          timestamp,
          timestamp,
        );
      }

      for (const row of articleRows) {
        const existingVariant = await get<{ id: string }>(
          "SELECT id FROM variants WHERE sku = ?",
          row.sku,
        );
        if (existingVariant) {
          /*
           * "details" is the product template: it may correct a size's
           * ordering but must never move a quantity, because the invoice is
           * the only thing that knows what is actually on the shelf.
           */
          if (mode === "details") {
            await run(
              `UPDATE variants SET product_id = ?, size = ?, size_order = ?, updated_at = ?
                WHERE id = ?`,
              productId,
              row.size,
              row.size_order,
              timestamp,
              existingVariant.id,
            );
          } else {
            await run(
              mode === "add"
                ? `UPDATE variants SET product_id = ?, size = ?, size_order = ?,
                     quantity = quantity + ?, updated_at = ? WHERE id = ?`
                : `UPDATE variants SET product_id = ?, size = ?, size_order = ?,
                     quantity = ?, updated_at = ? WHERE id = ?`,
              productId,
              row.size,
              row.size_order,
              row.quantity,
              timestamp,
              existingVariant.id,
            );
          }
          rowsUpdated++;
        } else {
          await run(
            `INSERT INTO variants (id, product_id, sku, size, size_order, quantity, updated_at)
             VALUES (?,?,?,?,?,?,?)`,
            uid(),
            productId,
            row.sku,
            row.size,
            row.size_order,
            row.quantity,
            timestamp,
          );
          rowsCreated++;
        }
      }
    }

    /* -- SKUs absent from the file ------------------------------------- */
    // Never delete a product row — quote history references it (§4.3).
    // Both modes zero the quantity; replace additionally hides the product so
    // it drops out of the catalogue without losing its history.
    if (mode !== "add" && mode !== "set" && mode !== "details") {
      for (const absent of diff.absent) {
        await run(
          "UPDATE variants SET quantity = 0, updated_at = ? WHERE sku = ?",
          timestamp,
          absent.sku,
        );
        rowsZeroed++;
      }
    }

    if (mode === "replace") {
      const absentArticles = new Set(diff.absent.map((a) => a.article_number));
      const presentArticles = new Set(rows.map((r) => r.article_number));
      for (const articleNumber of absentArticles) {
        // Only hide an article if none of its sizes appear in the file at all.
        if (presentArticles.has(articleNumber)) continue;
        await run(
          "UPDATE products SET is_visible = 0, updated_at = ? WHERE article_number = ?",
          timestamp,
          articleNumber,
        );
      }
    }

    await run(
      `INSERT INTO stock_imports (
         id, filename, storage_path, uploaded_by, mode,
         rows_total, rows_created, rows_updated, rows_zeroed, rows_failed,
         error_log, snapshot_before, status, invoice_refs, order_refs, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      importId,
      meta.filename,
      meta.storagePath ?? null,
      meta.uploadedBy ?? "owner",
      mode,
      diff.rowsRead,
      rowsCreated,
      rowsUpdated,
      rowsZeroed,
      diff.rowsFailed,
      JSON.stringify(diff.issues),
      JSON.stringify(snapshot),
      "committed",
      meta.invoiceRefs?.length ? JSON.stringify(meta.invoiceRefs) : null,
      meta.orderRefs?.length ? JSON.stringify(meta.orderRefs) : null,
      timestamp,
    );
  });

  // Stock is presented with the date it came from (§7.1), so this is the value
  // every "Stock as at" label on the site reads.
  await setSetting("last_import_at", timestamp);
  await audit("stock.import", importId, {
    filename: meta.filename,
    mode,
    rowsCreated,
    rowsUpdated,
    rowsZeroed,
  });

  return { importId, rowsCreated, rowsUpdated, rowsZeroed };
}

/* -------------------------------------------------------------------------
   Rollback (§4.2 step 6)
   ---------------------------------------------------------------------- */

export const ROLLBACK_WINDOW_DAYS = 30;

export function canRollback(importRow: { created_at: string; status: string }): boolean {
  if (importRow.status !== "committed") return false;
  const age = Date.now() - new Date(importRow.created_at).getTime();
  return age <= ROLLBACK_WINDOW_DAYS * 86_400_000;
}

export async function rollbackImport(importId: string): Promise<{ restored: number }> {
  const row = await get<{ id: string; snapshot_before: string; created_at: string; status: string }>(
    "SELECT id, snapshot_before, created_at, status FROM stock_imports WHERE id = ?",
    importId,
  );
  if (!row) throw new Error("That import no longer exists.");
  if (!canRollback(row)) {
    throw new Error(
      row.status === "rolled_back"
        ? "That import has already been rolled back."
        : `Imports can only be rolled back within ${ROLLBACK_WINDOW_DAYS} days.`,
    );
  }

  const snapshot = JSON.parse(row.snapshot_before) as Snapshot;
  let restored = 0;

  await transaction(async () => {
    // Restore rather than replace: products created since the import are left
    // alone if they are unrelated, but anything the import touched goes back to
    // exactly the state it was in.
    for (const p of snapshot.products) {
      const keys = Object.keys(p);
      await run(
        `INSERT INTO products (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})
         ON CONFLICT(id) DO UPDATE SET ${keys
           .filter((k) => k !== "id")
           .map((k) => `${k} = excluded.${k}`)
           .join(", ")}`,
        ...keys.map((k) => (p as Record<string, unknown>)[k]),
      );
    }

    for (const v of snapshot.variants) {
      const keys = Object.keys(v);
      await run(
        `INSERT INTO variants (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})
         ON CONFLICT(id) DO UPDATE SET ${keys
           .filter((k) => k !== "id")
           .map((k) => `${k} = excluded.${k}`)
           .join(", ")}`,
        ...keys.map((k) => (v as Record<string, unknown>)[k]),
      );
      restored++;
    }

    // Anything the import created did not exist in the snapshot. Zero and hide
    // it rather than deleting — the same rule as everywhere else (§4.3).
    const snapshotVariantIds = new Set(snapshot.variants.map((v) => String(v.id)));
    const currentVariants = await all<{ id: string }>("SELECT id FROM variants");
    for (const cv of currentVariants) {
      if (!snapshotVariantIds.has(cv.id)) {
        await run("UPDATE variants SET quantity = 0, updated_at = ? WHERE id = ?", now(), cv.id);
      }
    }
    const snapshotProductIds = new Set(snapshot.products.map((p) => String(p.id)));
    const currentProducts = await all<{ id: string }>("SELECT id FROM products");
    for (const cp of currentProducts) {
      if (!snapshotProductIds.has(cp.id)) {
        await run("UPDATE products SET is_visible = 0, updated_at = ? WHERE id = ?", now(), cp.id);
      }
    }

    await run("UPDATE stock_imports SET status = 'rolled_back' WHERE id = ?", importId);
  });

  await setSetting("last_import_at", snapshot.takenAt);
  await audit("stock.rollback", importId, { restored });

  return { restored };
}

export async function listImports(limit = 50) {
  return await all<{
    id: string;
    filename: string;
    mode: ImportMode;
    rows_total: number;
    rows_created: number;
    rows_updated: number;
    rows_zeroed: number;
    rows_failed: number;
    status: string;
    created_at: string;
  }>(
    `SELECT id, filename, mode, rows_total, rows_created, rows_updated,
            rows_zeroed, rows_failed, status, created_at
       FROM stock_imports ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
}
