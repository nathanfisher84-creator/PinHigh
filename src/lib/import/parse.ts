import {
  CATEGORIES,
  CONDITIONS,
  GENDERS,
  type Category,
  type Condition,
  type Gender,
} from "@/lib/domain/types";
import { deriveSku, normaliseSize, sizeOrder } from "@/lib/domain/sizes";
import { findHeaderRow, matchHeaders, type ColumnMap, type FieldKey, type HeaderMatch } from "./columns";
import { detectAdidasFormat, parseAdidasSheet } from "./adidas";
import { detectAdidasOrderFormat, parseAdidasOrderSheet } from "./adidas-order";

/**
 * Turn a parsed sheet into candidate SKU rows, with every problem the owner
 * needs to know about attached to a row number (spec §4.1).
 *
 * Nothing here touches the database. The whole point of §4.2 is that parsing
 * and validating happen first and the owner sees a diff before anything moves.
 */

export interface ParsedRow {
  /** 1-based row number as it appears in Excel, so the owner can go and look. */
  rowNumber: number;
  article_number: string;
  brand: string;
  style_group: string | null;
  style_name: string;
  condition: Condition;
  colour: string;
  gender: Gender;
  category: Category;
  size: string;
  size_order: number;
  quantity: number;
  price_wholesale: number | null;
  rrp: number | null;
  /** Admin-only cost, carried by the adidas invoice. Never shown publicly. */
  cost_price?: number | null;
  /** Set when the source had no name, colour, category or gender. */
  needs_review?: boolean;
  case_pack: number | null;
  moq: number | null;
  season: string | null;
  is_discontinued: boolean | null;
  sku: string;
}

export type IssueLevel = "error" | "warning";

export interface RowIssue {
  level: IssueLevel;
  rowNumber: number | null;
  field?: FieldKey | string;
  message: string;
  /** Extra rows involved, for conflicts that span more than one line. */
  relatedRows?: number[];
}

export interface ParseResult {
  header: HeaderMatch;
  headerRowIndex: number;
  rows: ParsedRow[];
  issues: RowIssue[];
  /** Rows read from the sheet, excluding the header and blank lines. */
  rowsRead: number;
  /** Rows dropped because they could not be made valid. */
  rowsFailed: number;
  /** Which file shape this was read as. */
  source?: "template" | "adidas" | "adidas-order";
  /** adidas invoice: invoice numbers, used to refuse a double-import. */
  billingDocuments?: string[];
  /** adidas implementation file: the sales orders it covers. */
  orderNumbers?: string[];
  purchaseOrders?: string[];
  /** adidas implementation file: articles with nothing shipped yet. */
  awaitingDelivery?: string[];
}

/* -------------------------------------------------------------------------
   Value normalisation
   ---------------------------------------------------------------------- */

const text = (v: string | null | undefined): string => (v ?? "").toString().trim();

/** Slugify a category label: "Golf Bags" -> "golf-bags", "T-Shirts" -> "t-shirts". */
export function slugifyCategory(raw: string): string {
  return text(raw)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CATEGORY_SET = new Set<string>(CATEGORIES);

/** Common ways the owner might write a category that is not the exact slug. */
const CATEGORY_ALIASES: Record<string, Category> = {
  polo: "polos",
  "polo-shirts": "polos",
  "polo-shirt": "polos",
  tshirts: "t-shirts",
  tshirt: "t-shirts",
  tees: "t-shirts",
  tee: "t-shirts",
  "t-shirt": "t-shirts",
  midlayers: "mid-layers",
  midlayer: "mid-layers",
  "mid-layer": "mid-layers",
  sweaters: "mid-layers",
  knitwear: "mid-layers",
  jackets: "outerwear",
  outerwear: "outerwear",
  waterproofs: "outerwear",
  pants: "trousers",
  trouser: "trousers",
  short: "shorts",
  skort: "skorts",
  skirts: "skorts",
  hats: "caps",
  cap: "caps",
  headwear: "caps",
  glove: "gloves",
  shoe: "shoes",
  footwear: "shoes",
  sock: "socks",
  belt: "belts",
  bags: "golf-bags",
  golfbags: "golf-bags",
  "stand-bags": "golf-bags",
  ball: "balls",
  golfballs: "balls",
  club: "clubs",
  putters: "clubs",
  irons: "clubs",
  woods: "clubs",
  "junior-set": "junior-sets",
  juniors: "junior-sets",
  rangefinder: "rangefinders",
  "laser-rangefinders": "rangefinders",
  trolley: "trolleys",
  towel: "towels",
  umbrella: "umbrellas",
  accessory: "accessories",
};

export function normaliseCategory(raw: string): Category | null {
  const slug = slugifyCategory(raw);
  if (!slug) return null;
  if (CATEGORY_SET.has(slug)) return slug as Category;
  if (CATEGORY_ALIASES[slug]) return CATEGORY_ALIASES[slug];
  // Tolerate a trailing plural the managed list does not have.
  const singular = slug.replace(/s$/, "");
  if (CATEGORY_SET.has(singular)) return singular as Category;
  if (CATEGORY_SET.has(`${slug}s`)) return `${slug}s` as Category;
  return null;
}

const GENDER_ALIASES: Record<string, Gender> = {
  mens: "mens",
  men: "mens",
  male: "mens",
  m: "mens",
  gents: "mens",
  gent: "mens",
  ladies: "ladies",
  lady: "ladies",
  womens: "ladies",
  women: "ladies",
  female: "ladies",
  w: "ladies",
  f: "ladies",
  junior: "junior",
  juniors: "junior",
  kids: "junior",
  kid: "junior",
  youth: "junior",
  boys: "junior",
  girls: "junior",
  unisex: "unisex",
  uni: "unisex",
  all: "unisex",
  u: "unisex",
  adult: "unisex",
};

export function normaliseGender(raw: string): Gender | null {
  const key = text(raw).toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;
  return GENDER_ALIASES[key] ?? (GENDERS.includes(key as Gender) ? (key as Gender) : null);
}

const CONDITION_ALIASES: Record<string, Condition> = {
  new: "new",
  brandnew: "new",
  bnib: "new",
  preowned: "pre-owned",
  preloved: "pre-owned",
  used: "pre-owned",
  secondhand: "pre-owned",
  exdisplay: "ex-display",
  display: "ex-display",
  exdemo: "ex-display",
  demo: "ex-display",
  shopsoiled: "ex-display",
};

/** Blank means new (§4.1). */
export function normaliseCondition(raw: string): Condition | null {
  const key = text(raw).toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return "new";
  return (
    CONDITION_ALIASES[key] ??
    (CONDITIONS.includes(key as Condition) ? (key as Condition) : null)
  );
}

/**
 * Parse a quantity. Accepts "1,250", "12 units", "12.0" and blank.
 * Returns null when the cell holds something that is not a count at all, so
 * the caller can report it rather than silently importing a zero — a wrongly
 * zeroed size run is invisible until a buyer cannot order it.
 */
export function parseQuantity(raw: string): number | null {
  const s = text(raw);
  if (!s) return null;
  const cleaned = s.replace(/[\s,'`]/g, "").replace(/units?$/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // A negative on-hand figure is a stock-system artefact, not an intention.
  return Math.max(0, Math.round(n));
}

/** Parse a price. Accepts "AED 78", "78.00", "1,250.50". Blank returns null. */
export function parsePrice(raw: string): number | null {
  const s = text(raw);
  if (!s) return null;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const normalised = cleaned.replace(",", ".");
  if (!normalised || !/^-?\d*\.?\d+$/.test(normalised)) return null;
  const n = Number(normalised);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseInteger(raw: string): number | null {
  const n = parseQuantity(raw);
  return n === null || n <= 0 ? null : n;
}

function parseBoolean(raw: string): boolean | null {
  const s = text(raw).toLowerCase();
  if (!s) return null;
  if (["1", "true", "yes", "y", "x"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return null;
}

/* -------------------------------------------------------------------------
   Parse
   ---------------------------------------------------------------------- */

export interface ParseOptions {
  /** A mapping the owner confirmed by hand, reused on later uploads (§4.1). */
  savedMap?: Record<string, FieldKey>;
  /** Overrides from the manual column-mapping UI: field key -> column index. */
  overrideMap?: ColumnMap;
}

export const MAX_ROWS = 20_000;
export const MAX_BYTES = 10 * 1024 * 1024;

export function parseStockSheet(
  sheetRows: (string | null)[][],
  options: ParseOptions = {},
): ParseResult {
  const issues: RowIssue[] = [];

  /*
   * The adidas delivery file is an SAP billing export with none of the columns
   * below. It is detected by its own signature and parsed separately rather
   * than being forced through fuzzy header matching, which would guess wrong
   * on sixty columns of accounting detail.
   */
  /*
   * The implementation file is checked first. It is the order book — every
   * article with its name, colour and fit — and the invoice is the shipping
   * record against it. Both are adidas SAP exports, so the more informative
   * one wins when a file could somehow look like either.
   */
  const orderHeaderRow = sheetRows.findIndex((r) => r && detectAdidasOrderFormat(r));
  if (orderHeaderRow !== -1) {
    const parsed = parseAdidasOrderSheet(sheetRows);
    return {
      header: {
        map: {},
        headers: (sheetRows[orderHeaderRow] ?? []).map((h) => h ?? ""),
        unmatched: [],
        missingRequired: [],
        inferred: [],
      },
      headerRowIndex: orderHeaderRow,
      rows: parsed.rows,
      issues: parsed.issues,
      rowsRead: parsed.rowsRead,
      rowsFailed: parsed.rowsFailed,
      source: "adidas-order",
      orderNumbers: parsed.orderNumbers,
      purchaseOrders: parsed.purchaseOrders,
      awaitingDelivery: parsed.awaitingDelivery,
    };
  }

  const adidasHeaderRow = sheetRows.findIndex((r) => r && detectAdidasFormat(r));
  if (adidasHeaderRow !== -1) {
    const parsed = parseAdidasSheet(sheetRows);
    return {
      header: {
        map: {},
        headers: (sheetRows[adidasHeaderRow] ?? []).map((h) => h ?? ""),
        unmatched: [],
        missingRequired: [],
        inferred: [],
      },
      headerRowIndex: adidasHeaderRow,
      rows: parsed.rows,
      issues: parsed.issues,
      rowsRead: parsed.rowsRead,
      rowsFailed: parsed.rowsFailed,
      source: "adidas",
      billingDocuments: parsed.billingDocuments,
      orderNumbers: parsed.salesOrders,
      purchaseOrders: parsed.purchaseOrders,
    };
  }

  const headerRowIndex = findHeaderRow(sheetRows);
  const header = matchHeaders(sheetRows[headerRowIndex] ?? [], options.savedMap);

  // A manual mapping from the UI wins over anything inferred.
  if (options.overrideMap) {
    for (const [key, index] of Object.entries(options.overrideMap)) {
      if (typeof index === "number" && index >= 0) {
        header.map[key as FieldKey] = index;
      }
    }
    header.missingRequired = header.missingRequired.filter(
      (k) => header.map[k] === undefined,
    );
  }

  if (header.missingRequired.length > 0) {
    // Caller shows the manual mapping UI. No point parsing rows we cannot read.
    return {
      header,
      headerRowIndex,
      rows: [],
      issues,
      rowsRead: 0,
      rowsFailed: 0,
    };
  }

  const cell = (row: (string | null)[], key: FieldKey): string => {
    const index = header.map[key];
    if (index === undefined) return "";
    return text(row[index]);
  };

  const rows: ParsedRow[] = [];
  let rowsRead = 0;
  let rowsFailed = 0;

  // Identity of an article, taken from its first occurrence. Later rows that
  // disagree are reported against it (§4.1).
  const articleIdentity = new Map<
    string,
    {
      rowNumber: number;
      style_name: string;
      colour: string;
      gender: Gender;
      category: Category;
      brand: string;
      style_group: string | null;
    }
  >();

  const seenSku = new Map<string, ParsedRow>();

  for (let i = headerRowIndex + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i] ?? [];
    const rowNumber = i + 1;

    // Skip genuinely blank lines silently — owners leave spacing rows.
    if (row.every((c) => c === null || text(c) === "")) continue;

    rowsRead++;

    if (rowsRead > MAX_ROWS) {
      issues.push({
        level: "error",
        rowNumber,
        message: `This file has more than ${MAX_ROWS.toLocaleString()} rows. Split it and upload in two parts.`,
      });
      break;
    }

    const article = cell(row, "article_number");
    if (!article) {
      // A row with no article number is almost always a subtotal or a note,
      // not a mistake. Report it as a warning and move on.
      issues.push({
        level: "warning",
        rowNumber,
        field: "article_number",
        message: "No article number on this row, so it was skipped.",
      });
      rowsFailed++;
      continue;
    }

    const rawSize = cell(row, "size");
    const size = normaliseSize(rawSize) || "ONE";

    const quantityRaw = cell(row, "quantity");
    const quantity = parseQuantity(quantityRaw);
    if (quantity === null) {
      issues.push({
        level: "error",
        rowNumber,
        field: "quantity",
        message: quantityRaw
          ? `Available reads "${quantityRaw}", which isn't a whole number.`
          : "Available is empty. Enter 0 if the size is sold out.",
      });
      rowsFailed++;
      continue;
    }

    const gender = normaliseGender(cell(row, "gender"));
    if (!gender) {
      issues.push({
        level: "error",
        rowNumber,
        field: "gender",
        message: `Gender reads "${cell(row, "gender")}". Use Mens, Ladies, Junior or Unisex.`,
      });
      rowsFailed++;
      continue;
    }

    const category = normaliseCategory(cell(row, "category"));
    if (!category) {
      issues.push({
        level: "error",
        rowNumber,
        field: "category",
        message: `Category reads "${cell(row, "category")}", which isn't on the list. Add it on the Lists tab or correct the spelling.`,
      });
      rowsFailed++;
      continue;
    }

    const condition = normaliseCondition(cell(row, "condition"));
    if (!condition) {
      issues.push({
        level: "error",
        rowNumber,
        field: "condition",
        message: `Condition reads "${cell(row, "condition")}". Use New, Pre-owned or Ex-display, or leave it blank for New.`,
      });
      rowsFailed++;
      continue;
    }

    const brand = cell(row, "brand");
    const style_name = cell(row, "style_name");
    const colour = cell(row, "colour");

    const missing: string[] = [];
    if (!brand) missing.push("Brand");
    if (!style_name) missing.push("Description");
    if (!colour) missing.push("Colour");
    if (missing.length) {
      issues.push({
        level: "error",
        rowNumber,
        message: `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} empty.`,
      });
      rowsFailed++;
      continue;
    }

    const style_group = cell(row, "style_group") || null;

    const parsed: ParsedRow = {
      rowNumber,
      article_number: article,
      brand,
      style_group,
      style_name,
      condition,
      colour,
      gender,
      category,
      size,
      size_order: sizeOrder(size),
      quantity,
      price_wholesale: parsePrice(cell(row, "price_wholesale")),
      rrp: parsePrice(cell(row, "rrp")),
      case_pack: parseInteger(cell(row, "case_pack")),
      moq: parseInteger(cell(row, "moq")),
      season: cell(row, "season") || null,
      is_discontinued: parseBoolean(cell(row, "is_discontinued")),
      cost_price: null,
      needs_review: false,
      sku: deriveSku(article, size),
    };

    /* -- Article identity conflicts (§4.1) ------------------------------- */
    const known = articleIdentity.get(article);
    if (!known) {
      articleIdentity.set(article, {
        rowNumber,
        style_name,
        colour,
        gender,
        category,
        brand,
        style_group,
      });
    } else {
      const conflicts: string[] = [];
      if (known.style_name !== style_name)
        conflicts.push(`Description "${known.style_name}" vs "${style_name}"`);
      if (known.colour !== colour) conflicts.push(`Colour "${known.colour}" vs "${colour}"`);
      if (known.gender !== gender) conflicts.push(`Gender "${known.gender}" vs "${gender}"`);
      if (known.category !== category)
        conflicts.push(`Category "${known.category}" vs "${category}"`);
      if (known.brand !== brand) conflicts.push(`Brand "${known.brand}" vs "${brand}"`);

      if (conflicts.length) {
        issues.push({
          level: "error",
          rowNumber,
          message: `Article ${article} is described two different ways: ${conflicts.join("; ")}. The first version was used.`,
          relatedRows: [known.rowNumber],
        });
        // Take the first occurrence unless the owner corrects it (§4.1). The
        // row still imports — only its identity fields are overridden.
        parsed.style_name = known.style_name;
        parsed.colour = known.colour;
        parsed.gender = known.gender;
        parsed.category = known.category;
        parsed.brand = known.brand;
        parsed.style_group = known.style_group;
      }
    }

    /* -- Duplicate article + size: sum and warn (§4.1) ------------------- */
    const existing = seenSku.get(parsed.sku);
    if (existing) {
      existing.quantity += parsed.quantity;
      issues.push({
        level: "warning",
        rowNumber,
        message: `Article ${article} size ${size} appears twice. The quantities were added together (${existing.quantity}).`,
        relatedRows: [existing.rowNumber],
      });
      // Later rows still win on price, which is how a corrections row behaves.
      if (parsed.price_wholesale !== null) existing.price_wholesale = parsed.price_wholesale;
      if (parsed.rrp !== null) existing.rrp = parsed.rrp;
      continue;
    }

    seenSku.set(parsed.sku, parsed);
    rows.push(parsed);
  }

  /* -- Style group coherence: warn, never block (§4.1) ------------------- */
  const groupShape = new Map<string, { genders: Set<string>; categories: Set<string>; rows: number[] }>();
  for (const r of rows) {
    if (!r.style_group) continue;
    let g = groupShape.get(r.style_group);
    if (!g) {
      g = { genders: new Set(), categories: new Set(), rows: [] };
      groupShape.set(r.style_group, g);
    }
    g.genders.add(r.gender);
    g.categories.add(r.category);
    if (g.rows.length < 5) g.rows.push(r.rowNumber);
  }
  for (const [group, shape] of groupShape) {
    if (shape.genders.size > 1 || shape.categories.size > 1) {
      issues.push({
        level: "warning",
        rowNumber: null,
        message: `Style group "${group}" mixes ${
          shape.genders.size > 1 ? `genders (${[...shape.genders].join(", ")})` : ""
        }${shape.genders.size > 1 && shape.categories.size > 1 ? " and " : ""}${
          shape.categories.size > 1 ? `categories (${[...shape.categories].join(", ")})` : ""
        }. That's allowed, but check it's what you meant.`,
        relatedRows: shape.rows,
      });
    }
  }

  return { header, headerRowIndex, rows, issues, rowsRead, rowsFailed };
}
