/**
 * The adidas delivery file.
 *
 * This is not a stock list — it is an SAP billing export of what adidas
 * invoiced Pin High. It carries sixty-odd columns of accounting detail and
 * exactly four things the catalogue cares about:
 *
 *   Material            the article number, six characters — HZ6891, KS2292
 *   AFS Grid Value      the size — XS, S, M, L, XL, 2XL, 3XL, 4XL
 *   Invoiced Quantity   units, written as "3.000"
 *   Net value           the line's cost, from which the unit cost is derived
 *
 * What it does NOT carry is a product name, a colour, a category or a gender.
 * So an import creates the articles and their size runs, marks them as needing
 * detail, and leaves them hidden until the owner has named them. Publishing a
 * product called "HZ6891" with no colour would be worse than publishing
 * nothing.
 *
 * Two prices appear per line and neither is a selling price:
 *   Net value / qty   what Pin High paid adidas. Cost. Admin-only, never shown.
 *   Subtotal 1 / qty  adidas' gross line value, treated as the RRP reference.
 * The corporate price a buyer sees is the owner's margin decision and is set
 * in the admin panel. Importing cost as the public price would put a
 * distributor's buying terms in front of its own customers.
 */

import { deriveSku, normaliseSize, sizeOrder } from "@/lib/domain/sizes";
import type { ParsedRow, RowIssue } from "./parse";

/** Columns that together identify an SAP billing export. */
const SIGNATURE = ["material", "afsgridvalue", "invoicedquantity"];

const norm = (s: string): string =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface AdidasHeaderIndex {
  material: number;
  size: number;
  quantity: number;
  netValue: number;
  subtotal: number;
  billingDocument: number;
  purchaseOrder: number;
  billingDate: number;
  currency: number;
  salesOrder: number;
}

/**
 * Is this the adidas file? Requires all three signature columns, so an
 * ordinary stock sheet that happens to have a "Material" column is not
 * misread as an invoice.
 */
export function detectAdidasFormat(headerRow: (string | null)[]): boolean {
  const headers = headerRow.map((h) => norm(h ?? ""));
  return SIGNATURE.every((sig) => headers.includes(sig));
}

function indexHeaders(headerRow: (string | null)[]): AdidasHeaderIndex {
  const headers = headerRow.map((h) => norm(h ?? ""));
  const at = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    material: at("material"),
    size: at("afsgridvalue", "gridvalue"),
    quantity: at("invoicedquantity", "quantity"),
    netValue: at("netvalue"),
    subtotal: at("subtotal1"),
    billingDocument: at("billingdocument"),
    purchaseOrder: at("purorder", "purchaseorder"),
    billingDate: at("billingdate"),
    currency: at("documentcurrency"),
    salesOrder: at("originalsalesorder"),
  };
}

export interface AdidasParseResult {
  rows: ParsedRow[];
  issues: RowIssue[];
  rowsRead: number;
  rowsFailed: number;
  /** Invoice numbers found in the file, used to refuse a double-import. */
  billingDocuments: string[];
  /** The sales order this invoice bills against — joins it to the
   *  implementation file, which carries the same number. */
  salesOrders: string[];
  purchaseOrders: string[];
  currency: string | null;
}

/** "3.000" -> 3. SAP writes quantities with three decimal places. */
function parseSapQuantity(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function parseSapAmount(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseAdidasSheet(sheetRows: (string | null)[][]): AdidasParseResult {
  const issues: RowIssue[] = [];
  const headerRowIndex = sheetRows.findIndex((r) => r && detectAdidasFormat(r));
  const idx = indexHeaders(sheetRows[headerRowIndex] ?? []);

  const rows: ParsedRow[] = [];
  const bySku = new Map<string, ParsedRow>();
  const billingDocuments = new Set<string>();
  const purchaseOrders = new Set<string>();
  const salesOrders = new Set<string>();
  let currency: string | null = null;

  let rowsRead = 0;
  let rowsFailed = 0;

  const cell = (row: (string | null)[], i: number): string =>
    i >= 0 && i < row.length ? String(row[i] ?? "").trim() : "";

  for (let i = headerRowIndex + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i] ?? [];
    const rowNumber = i + 1;

    if (row.every((c) => c === null || String(c ?? "").trim() === "")) continue;

    const material = cell(row, idx.material);

    /*
     * SAP appends a totals line with no Material but figures in the numeric
     * columns. Skipping it silently is correct — it is not an error the owner
     * can act on, and reporting it every month would train them to ignore
     * the warnings that do matter.
     */
    if (!material) continue;

    rowsRead++;

    const doc = cell(row, idx.billingDocument);
    if (doc) billingDocuments.add(doc);
    const po = cell(row, idx.purchaseOrder);
    if (po) purchaseOrders.add(po);
    const so = cell(row, idx.salesOrder);
    if (so) salesOrders.add(so);
    if (!currency) currency = cell(row, idx.currency) || null;

    const rawSize = cell(row, idx.size);
    if (!rawSize) {
      issues.push({
        level: "error",
        rowNumber,
        field: "size",
        message: `Article ${material} has no size against it, so it was skipped.`,
      });
      rowsFailed++;
      continue;
    }

    const quantity = parseSapQuantity(cell(row, idx.quantity));
    if (quantity === null) {
      issues.push({
        level: "error",
        rowNumber,
        field: "quantity",
        message: `Article ${material} size ${rawSize}: quantity reads "${cell(
          row,
          idx.quantity,
        )}", which isn't a number.`,
      });
      rowsFailed++;
      continue;
    }

    const size = normaliseSize(rawSize);
    const sku = deriveSku(material, size);

    const netLine = parseSapAmount(cell(row, idx.netValue));
    const grossLine = parseSapAmount(cell(row, idx.subtotal));
    const unitCost = netLine !== null && quantity > 0 ? netLine / quantity : null;
    const unitRrp = grossLine !== null && quantity > 0 ? grossLine / quantity : null;

    const existing = bySku.get(sku);
    if (existing) {
      // The same article and size can appear on more than one line of an
      // invoice. Those are separate deliveries of the same thing, so they add.
      existing.quantity += quantity;
      issues.push({
        level: "warning",
        rowNumber,
        message: `Article ${material} size ${size} appears more than once. The quantities were added together (${existing.quantity}).`,
      });
      continue;
    }

    const parsed: ParsedRow = {
      rowNumber,
      article_number: material,
      brand: "adidas",
      style_group: null,
      // No name in the file. The article number stands in until the owner
      // renames it, and needs_review keeps it out of the catalogue meanwhile.
      style_name: material,
      condition: "new",
      colour: "",
      gender: "unisex",
      category: "accessories",
      size,
      size_order: sizeOrder(size),
      quantity,
      // Deliberately not price_wholesale: cost is not a selling price.
      price_wholesale: null,
      rrp: unitRrp === null ? null : Math.round(unitRrp * 100) / 100,
      cost_price: unitCost === null ? null : Math.round(unitCost * 100) / 100,
      needs_review: true,
      case_pack: null,
      moq: null,
      season: null,
      is_discontinued: null,
      sku,
    };

    bySku.set(sku, parsed);
    rows.push(parsed);
  }

  if (rows.length > 0) {
    const articles = new Set(rows.map((r) => r.article_number));
    issues.push({
      level: "warning",
      rowNumber: null,
      message: `This is an adidas invoice, so it carries article numbers, sizes and quantities but no product names or colours. The ${articles.size} ${
        articles.size === 1 ? "article" : "articles"
      } below will be added and held back from the website until you give them a name and colour.`,
    });
  }

  return {
    rows,
    issues,
    rowsRead,
    rowsFailed,
    billingDocuments: [...billingDocuments],
    salesOrders: [...salesOrders],
    purchaseOrders: [...purchaseOrders],
    currency,
  };
}
