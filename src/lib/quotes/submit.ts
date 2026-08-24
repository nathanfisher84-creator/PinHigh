import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { putArtwork } from "@/lib/images/storage";
import { getVariantsBySku } from "@/lib/repo/catalogue";
import { createQuoteRequest, type CreateQuoteInput } from "@/lib/repo/quotes";
import { dispatchQuoteNotifications } from "@/lib/notify";
import type { QuoteLineInput } from "@/lib/validation/quote";
import type { QuoteRequestWithLines } from "@/lib/domain/types";

/**
 * Quote persistence — the part the buyer actually cares about.
 *
 * Stock is not touched here. Notification failure (including a skipped
 * channel because email is not configured) must never fail the request:
 * the row is already committed before we dispatch.
 */

const LOGO_TYPES = new Map<string, string>([
  ["application/postscript", "ai"],
  ["application/illustrator", "ai"],
  ["application/pdf", "pdf"],
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/x-eps", "eps"],
  ["application/eps", "eps"],
]);

const MAX_LOGO_BYTES = 25 * 1024 * 1024;
const MAX_LOGOS = 8;

export async function storeLogoFile(file: File): Promise<{ path: string; name: string }> {
  if (!file || file.size === 0) {
    throw new Error("Empty logo file.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("That logo file is over 25 MB. Send it to us by email instead.");
  }

  const extFromName = path.extname(file.name).replace(".", "").toLowerCase();
  const ext = LOGO_TYPES.get(file.type) ?? (extFromName || "bin");
  const stored = `${randomUUID()}.${ext.replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
  await putArtwork(stored, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
  return { path: stored, name: file.name };
}

export function collectLogoFiles(formData: FormData): File[] {
  const files: File[] = [];
  const seen = new Set<File>();
  const add = (value: FormDataEntryValue | null) => {
    if (value instanceof File && value.size > 0 && !seen.has(value)) {
      seen.add(value);
      files.push(value);
    }
  };
  add(formData.get("logo"));
  for (const value of formData.getAll("logos")) add(value);
  for (const value of formData.getAll("logo")) add(value);
  return files.slice(0, MAX_LOGOS);
}

export interface PersistQuoteInput {
  company_name: string;
  trn?: string;
  contact_name: string;
  contact_role?: string;
  email: string;
  phone: string;
  delivery_emirate: string;
  required_by?: string;
  notes?: string;
  logo_notes?: string;
  lines: QuoteLineInput[];
  logoPaths: { storage_path: string; original_name?: string | null }[];
}

export async function persistQuoteRequest(input: PersistQuoteInput): Promise<QuoteRequestWithLines> {
  const live = await getVariantsBySku(input.lines.map((l) => l.sku));

  const resolved: CreateQuoteInput["lines"] = input.lines.map((line) => {
    const variant = live.get(line.sku);

    if (!variant) {
      return {
        sku: line.sku,
        article_number: line.article_number,
        brand: "—",
        style_name: "Item no longer in the catalogue",
        colour: "—",
        size: line.size,
        quantity: line.quantity,
        unit_price: null,
        rrp: null,
        branding_placements: line.branding?.placements ?? null,
        stock_flag: "This article is no longer listed — check with the buyer.",
      };
    }

    let stockFlag: string | null = null;
    if (variant.quantity <= 0) {
      stockFlag = `Sold out since the buyer added it (they asked for ${line.quantity}).`;
    } else if (variant.quantity < line.quantity) {
      stockFlag = `Only ${variant.quantity} left — the buyer asked for ${line.quantity}.`;
    } else if (!variant.is_visible) {
      stockFlag = "This article has been hidden in the admin panel since the buyer added it.";
    }

    return {
      sku: line.sku,
      article_number: variant.article_number,
      brand: variant.brand,
      style_name: variant.style_name,
      colour: variant.colour,
      size: variant.size,
      quantity: line.quantity,
      unit_price: variant.price_wholesale,
      rrp: variant.rrp,
      branding_placements: line.branding?.placements?.length ? line.branding.placements : null,
      stock_flag: stockFlag,
    };
  });

  const firstLogo = input.logoPaths[0]?.storage_path ?? null;

  const quote = await createQuoteRequest({
    company_name: input.company_name,
    trn: input.trn || null,
    contact_name: input.contact_name,
    contact_role: input.contact_role || null,
    email: input.email,
    phone: input.phone,
    delivery_emirate: input.delivery_emirate,
    required_by: input.required_by || null,
    notes: input.notes || null,
    logo_path: firstLogo,
    logo_notes: input.logo_notes || null,
    logos: input.logoPaths,
    lines: resolved,
  });

  try {
    await dispatchQuoteNotifications(quote);
  } catch (err) {
    console.error("[pinhigh] notification dispatch failed:", err);
  }

  return quote;
}
