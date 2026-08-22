/**
 * The adidas implementation file.
 *
 * This is the order book: every article Pin High bought for a season, with the
 * product detail the invoice does not carry. It is the file that makes the
 * catalogue, and the invoice is the shipping record against it — the two are
 * joined by `Order Number`, which appears on the invoice as
 * `Original Sales Order`.
 *
 * The columns that matter:
 *
 *   Article No                     six-character article number
 *   Article Name                   name and colourway in one fixed-width field
 *   Business Segment Description   "GOLF APP MEN" — apparel, menswear
 *   Gender Description             MALE / FEMALE
 *   Size                           XS…4XL
 *   Quantity Ordered               what was ordered
 *   Delivered Qty                  what has actually shipped — cumulative
 *   Cancelled Qty                  what will never arrive
 *   Net Price/Unit                 cost to Pin High. Admin-only.
 *   Manual Price                   adidas' gross, used as the RRP reference
 *
 * **No stock is taken from this file.** It is the template: it defines which
 * articles exist, what they are called, and which sizes they come in. The
 * quantities in it are order-book positions, not what is on the shelf — the
 * invoice is the only thing that sets stock.
 *
 * That makes the import idempotent and safe to repeat: a re-issued template
 * refreshes names, colours and prices and creates any new sizes at zero, and
 * it can never disturb a quantity an invoice has established.
 */

import { deriveSku, normaliseSize, sizeOrder } from "@/lib/domain/sizes";
import type { Category, Gender } from "@/lib/domain/types";
import type { ParsedRow, RowIssue } from "./parse";

const SIGNATURE = ["articleno", "articlename", "quantityordered"];

const norm = (s: string): string =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectAdidasOrderFormat(headerRow: (string | null)[]): boolean {
  const headers = headerRow.map((h) => norm(h ?? ""));
  return SIGNATURE.every((sig) => headers.includes(sig));
}

/**
 * Split `Article Name` into a product name and a colourway.
 *
 * SAP writes this as two fixed-width fields run together —
 * `PERF TXT POLO       WHITE/MAROON` — so a run of two or more spaces is the
 * boundary. Everything after it is adidas' colour code, kept as adidas writes
 * it: expanding `FROTUR` into a guess at "Frozen Turquoise" would be inventing
 * data, and the owner can rename it in one field.
 */
export function splitArticleName(raw: string): { name: string; colour: string } {
  const value = String(raw ?? "").trim().replace(/\s+$/, "");
  const parts = value.split(/\s{2,}/);
  if (parts.length >= 2) {
    return {
      name: titleCaseName(parts[0].trim()),
      colour: titleCaseColour(parts.slice(1).join(" ").trim()),
    };
  }
  return { name: titleCaseName(value), colour: "" };
}

/**
 * "PERF TXT POLO" -> "Perf Txt Polo". adidas ships these shouting.
 *
 * This stored form is the importer identity — a re-import matches on it.
 * Buyer-facing titles are expanded in display-name.ts, not here.
 */
function titleCaseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

/** "WHITE/MAROON" -> "White / Maroon". */
function titleCaseColour(s: string): string {
  return s
    .split("/")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/\b[a-z0-9]/g, (c) => c.toUpperCase()),
    )
    .filter(Boolean)
    .join(" / ");
}

/**
 * Category from the product name.
 *
 * Only matched where the name says so plainly. adidas' abbreviations are not
 * a documented vocabulary, so anything unrecognised is left for the owner
 * rather than guessed at — filing a hoodie under Polos because "HD" looked
 * close enough is worse than asking.
 */
const NAME_CATEGORY: [RegExp, Category][] = [
  [/\bPOLO\b/i, "polos"],
  [/\bTEE\b|\bT-?SHIRT\b/i, "t-shirts"],
  [/\bHOODY?\b|\bHOODIE\b|\bCREW\b|\bSWEAT\b|\bQ ?Z\b|\bQTR ?ZIP\b|\b1\/4 ?ZIP\b|\bMIDLAYER\b/i, "mid-layers"],
  [/\bJKT\b|\bJACKET\b|\bVEST\b|\bWIND\b|\bRAIN\b|\bANORAK\b/i, "outerwear"],
  [/\bSHORT\b/i, "shorts"],
  [/\bPANT\b|\bTROUSER\b/i, "trousers"],
  [/\bSKORT\b|\bSKIRT\b/i, "skorts"],
  [/\bCAP\b|\bHAT\b|\bVISOR\b/i, "caps"],
  [/\bGLOVE\b/i, "gloves"],
  [/\bSHOE\b|\bFOOTWEAR\b/i, "shoes"],
  [/\bBELT\b/i, "belts"],
  [/\bSOCK\b/i, "socks"],
  [/\bBAG\b/i, "golf-bags"],
  [/\bBALL\b/i, "balls"],
  [/\bTOWEL\b/i, "towels"],
  [/\bUMBRELLA\b/i, "umbrellas"],
];

export function categoryFromName(name: string): Category | null {
  for (const [re, category] of NAME_CATEGORY) {
    if (re.test(name)) return category;
  }
  return null;
}

export function genderFrom(genderDescription: string, segment: string): Gender {
  const g = `${genderDescription} ${segment}`.toUpperCase();
  if (/\bFEMALE\b|\bWOMEN\b|\bWMN\b|\bLADIES\b/.test(g)) return "ladies";
  if (/\bMALE\b|\bMEN\b/.test(g)) return "mens";
  if (/\bKID\b|\bJUNIOR\b|\bYOUTH\b|\bBOY\b|\bGIRL\b/.test(g)) return "junior";
  return "unisex";
}

/** SAP writes an absent price as 0.00; that is not a price of zero. */
function priceOrNull(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function qty(raw: string): number {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return 0;
  return Math.max(0, Math.round(Number(s)));
}

export interface AdidasOrderResult {
  rows: ParsedRow[];
  issues: RowIssue[];
  rowsRead: number;
  rowsFailed: number;
  orderNumbers: string[];
  purchaseOrders: string[];
  /** Articles ordered but not yet shipped, so they land with no stock. */
  awaitingDelivery: string[];
  /** Articles whose whole order was cancelled. */
  fullyCancelled: string[];
}

export function parseAdidasOrderSheet(sheetRows: (string | null)[][]): AdidasOrderResult {
  const issues: RowIssue[] = [];
  const headerRowIndex = sheetRows.findIndex((r) => r && detectAdidasOrderFormat(r));
  const headers = (sheetRows[headerRowIndex] ?? []).map((h) => norm(h ?? ""));

  const at = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const idx = {
    article: at("articleno"),
    name: at("articlename"),
    segment: at("businesssegmentdescription"),
    gender: at("genderdescription"),
    size: at("size"),
    ordered: at("quantityordered"),
    delivered: at("deliveredqty"),
    cancelled: at("cancelledqty"),
    net: at("netpriceunit"),
    manual: at("manualprice"),
    retail: at("retailpriceunit"),
    order: at("ordernumber"),
    po: at("customerpurchaseno"),
  };

  const cell = (row: (string | null)[], i: number): string =>
    i >= 0 && i < row.length ? String(row[i] ?? "").trim() : "";

  const bySku = new Map<string, ParsedRow>();
  const rows: ParsedRow[] = [];
  const orderNumbers = new Set<string>();
  const purchaseOrders = new Set<string>();
  const orderedTotals = new Map<string, number>();

  let rowsRead = 0;
  let rowsFailed = 0;

  for (let i = headerRowIndex + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i] ?? [];
    const rowNumber = i + 1;

    if (row.every((c) => c === null || String(c ?? "").trim() === "")) continue;

    const article = cell(row, idx.article);
    // SAP appends a totals line with no article. Skipping it silently is
    // right: it is not something the owner can act on.
    if (!article) continue;

    rowsRead++;

    const rawSize = cell(row, idx.size);
    if (!rawSize) {
      issues.push({
        level: "error",
        rowNumber,
        field: "size",
        message: `Article ${article} has no size against it, so it was skipped.`,
      });
      rowsFailed++;
      continue;
    }

    if (cell(row, idx.order)) orderNumbers.add(cell(row, idx.order));
    if (cell(row, idx.po)) purchaseOrders.add(cell(row, idx.po));

    const { name, colour } = splitArticleName(cell(row, idx.name));
    const segment = cell(row, idx.segment);
    const gender = genderFrom(cell(row, idx.gender), segment);
    const category = categoryFromName(name);

    // Read only to report on: the template never sets stock.
    orderedTotals.set(
      article,
      (orderedTotals.get(article) ?? 0) + qty(cell(row, idx.ordered)),
    );

    const size = normaliseSize(rawSize);
    const sku = deriveSku(article, size);

    /*
     * The same article and size legitimately appears on more than one line
     * when part of an order is cancelled — HZ6893 has two 2XL rows. Since no
     * quantity is taken from this file there is nothing to reconcile; the
     * size already exists on the article.
     */
    if (bySku.has(sku)) continue;

    const parsed: ParsedRow = {
      rowNumber,
      article_number: article,
      brand: "adidas",
      style_group: null,
      style_name: name || article,
      condition: "new",
      colour,
      gender,
      // Parked in accessories when the name does not say; needs_review below
      // keeps it in front of the owner until they set it.
      category: category ?? "accessories",
      size,
      size_order: sizeOrder(size),
      // Always zero. Stock comes from the invoice, never from the template.
      quantity: 0,
      // Cost is never the selling price. The owner sets that.
      price_wholesale: null,
      rrp: priceOrNull(cell(row, idx.manual)) ?? priceOrNull(cell(row, idx.retail)),
      cost_price: priceOrNull(cell(row, idx.net)),
      // The file gives a name, colour and fit. Only an unrecognised category
      // still needs a human.
      needs_review: category === null,
      case_pack: null,
      moq: null,
      season: null,
      is_discontinued: null,
      sku,
    };

    bySku.set(sku, parsed);
    rows.push(parsed);
  }

  /* -- What the owner should know about this template ------------------ */

  const awaitingDelivery: string[] = [];
  const fullyCancelled: string[] = [];

  if (rows.length > 0) {
    const articles = new Set(rows.map((r) => r.article_number));
    issues.push({
      level: "warning",
      rowNumber: null,
      message: `This is the product template, so no stock is taken from it. ${articles.size} ${
        articles.size === 1 ? "article" : "articles"
      } and ${rows.length} sizes will be created or refreshed. Quantities stay exactly as they are — upload the invoice to set those.`,
    });
  }

  const needingCategory = [
    ...new Set(rows.filter((r) => r.needs_review).map((r) => r.article_number)),
  ];
  if (needingCategory.length > 0) {
    issues.push({
      level: "warning",
      rowNumber: null,
      message: `${needingCategory.length} ${
        needingCategory.length === 1 ? "article" : "articles"
      } could not be categorised from the product name (${needingCategory.join(
        ", ",
      )}). Set the category in Products and they will appear under it.`,
    });
  }

  return {
    rows,
    issues,
    rowsRead,
    rowsFailed,
    orderNumbers: [...orderNumbers],
    purchaseOrders: [...purchaseOrders],
    awaitingDelivery,
    fullyCancelled,
  };
}
