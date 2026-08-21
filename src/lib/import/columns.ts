/**
 * Fuzzy header matching (spec §4.1).
 *
 * The owner's real file will not have the template's headers. It will have
 * "Qty", or "Art. No", or a stray trailing space, or a column he added for his
 * own working notes. The importer's job is to cope with all of that quietly and
 * only ask for help when it genuinely cannot tell.
 *
 * Two discrepancies between spec §4.1 and the supplied template, both handled:
 *   - §4.1 calls the price column "Wholesale Price"; the actual template ships
 *     "Corporate Price". Both map to price_wholesale.
 *   - §4.1 names the template `fairline-stock-template.xlsx`; the supplied file
 *     is `pinhigh-stock-template.xlsx`. Naming only, no behaviour depends on it.
 */

export type FieldKey =
  | "article_number"
  | "brand"
  | "style_group"
  | "style_name"
  | "condition"
  | "colour"
  | "gender"
  | "category"
  | "size"
  | "quantity"
  | "price_wholesale"
  | "rrp"
  | "case_pack"
  | "moq"
  | "season"
  | "is_discontinued";

export interface FieldSpec {
  key: FieldKey;
  /** The header as it appears in the canonical template. */
  canonical: string;
  required: boolean;
  /** Normalised aliases. Matched after stripping case, spaces, _ and -. */
  aliases: string[];
  help: string;
}

export const FIELDS: FieldSpec[] = [
  {
    key: "article_number",
    canonical: "Article Number",
    required: true,
    aliases: [
      "articlenumber", "article", "articleno", "articlenr", "artnr", "artno",
      "itemcode", "itemno", "item", "ref", "reference", "productcode", "code",
      "styleno", "stylecode", "sku", "modelnumber",
    ],
    help: "The unique code for one product in one colour.",
  },
  {
    key: "brand",
    canonical: "Brand",
    required: true,
    aliases: ["brand", "make", "manufacturer", "vendor", "supplier", "label"],
    help: "adidas, Callaway, Titleist and so on.",
  },
  {
    key: "style_group",
    canonical: "Style Group",
    required: false,
    aliases: ["stylegroup", "model", "style", "parent", "parentstyle", "group", "family"],
    help: "Links sibling colourways. Blank is valid.",
  },
  {
    key: "style_name",
    canonical: "Description",
    required: true,
    aliases: [
      "description", "name", "product", "stylename", "productname", "title",
      "productdescription", "desc", "itemdescription",
    ],
    help: "The product name without the brand.",
  },
  {
    key: "condition",
    canonical: "Condition",
    required: false,
    aliases: ["condition", "state", "grade", "stockcondition"],
    help: "New, Pre-owned or Ex-display. Blank means New.",
  },
  {
    key: "colour",
    canonical: "Colour",
    required: true,
    aliases: ["colour", "color", "col", "colourway", "colorway", "shade"],
    help: "The colourway on its own.",
  },
  {
    key: "gender",
    canonical: "Gender",
    required: true,
    aliases: ["gender", "sex", "department", "dept", "audience", "fit"],
    help: "Mens, Ladies, Junior or Unisex.",
  },
  {
    key: "category",
    canonical: "Category",
    required: true,
    aliases: ["category", "type", "producttype", "itemtype", "group2", "productgroup", "range"],
    help: "Polos, Shoes, Golf Bags and so on.",
  },
  {
    key: "size",
    canonical: "Size",
    required: true,
    aliases: ["size", "sizes", "sizecode", "variant", "sizename"],
    help: "S, M, L, a waist or shoe size, or ONE.",
  },
  {
    key: "quantity",
    canonical: "Available",
    required: true,
    aliases: [
      "available", "qty", "quantity", "stock", "instock", "onhand", "soh",
      "stockonhand", "free", "availableqty", "units", "balance",
    ],
    help: "Units in stock right now.",
  },
  {
    key: "price_wholesale",
    canonical: "Corporate Price",
    required: false,
    aliases: [
      "corporateprice", "wholesaleprice", "wholesale", "trade", "tradeprice",
      "price", "cost", "costprice", "netprice", "unitprice", "buyprice",
    ],
    help: "Per unit in AED, excluding VAT. Blank keeps the existing price.",
  },
  {
    key: "rrp",
    canonical: "Retail Price",
    required: false,
    aliases: ["retailprice", "retail", "rrp", "srp", "msrp", "listprice", "sellprice"],
    help: "Recommended retail in AED.",
  },
  // Managed in the admin panel, not the spreadsheet (§4.1). Accepted if
  // present, never required.
  {
    key: "case_pack",
    canonical: "Case Pack",
    required: false,
    aliases: ["casepack", "case", "packsize", "innerpack", "boxqty", "pack"],
    help: "Order must be a multiple of this. Optional.",
  },
  {
    key: "moq",
    canonical: "MOQ",
    required: false,
    aliases: ["moq", "minorder", "minimumorder", "minqty", "minimumquantity"],
    help: "Minimum units per article. Optional.",
  },
  {
    key: "season",
    canonical: "Season",
    required: false,
    aliases: ["season", "collection", "drop", "range2"],
    help: "e.g. SS26. Optional.",
  },
  {
    key: "is_discontinued",
    canonical: "Discontinued",
    required: false,
    aliases: ["discontinued", "isdiscontinued", "eol", "endoflife", "inactive"],
    help: "Optional.",
  },
];

export const REQUIRED_FIELDS = FIELDS.filter((f) => f.required).map((f) => f.key);

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/**
 * Normalise a header for matching: lowercase, then strip everything that is
 * not a letter or digit. This collapses "Art. No", "art_no" and "ART NO" to
 * the same key, which is the whole point.
 */
export function normaliseHeader(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop "(AED)", "(ex VAT)" and friends
    .replace(/[^a-z0-9]/g, "");
}

export type ColumnMap = Partial<Record<FieldKey, number>>;

export interface HeaderMatch {
  /** Field key -> zero-based column index. */
  map: ColumnMap;
  /** Headers as they appeared in the file, by column index. */
  headers: string[];
  /** Columns the importer did not recognise. Ignored silently (§4.1). */
  unmatched: { index: number; header: string }[];
  /** Required fields with no column. Triggers the manual mapping UI. */
  missingRequired: FieldKey[];
  /** Fields matched by alias rather than exact name, worth showing the owner. */
  inferred: { key: FieldKey; header: string }[];
}

/**
 * Match a header row to fields.
 *
 * `savedMap` is a previously confirmed manual mapping for this owner, keyed by
 * normalised header. Spec §4.1: "save that mapping and reuse it next time" —
 * so the owner maps his odd column once, not every month.
 */
export function matchHeaders(
  headerRow: (string | null)[],
  savedMap?: Record<string, FieldKey>,
): HeaderMatch {
  const headers = headerRow.map((h) => (h ?? "").toString().trim());
  const map: ColumnMap = {};
  const inferred: { key: FieldKey; header: string }[] = [];
  const claimed = new Set<number>();

  const assign = (key: FieldKey, index: number, wasInferred: boolean, header: string) => {
    // First column wins. A file with two "Qty" columns takes the leftmost,
    // which is what someone reading the sheet would assume.
    if (map[key] !== undefined || claimed.has(index)) return;
    map[key] = index;
    claimed.add(index);
    if (wasInferred) inferred.push({ key, header });
  };

  const normalised = headers.map(normaliseHeader);

  // Pass 1 — exact match against the canonical template header.
  for (const field of FIELDS) {
    const target = normaliseHeader(field.canonical);
    const idx = normalised.findIndex((h, i) => h === target && !claimed.has(i));
    if (idx !== -1) assign(field.key, idx, false, headers[idx]);
  }

  // Pass 2 — a mapping the owner confirmed by hand on a previous import.
  if (savedMap) {
    for (const [header, key] of Object.entries(savedMap)) {
      const idx = normalised.findIndex((h, i) => h === header && !claimed.has(i));
      if (idx !== -1) assign(key, idx, true, headers[idx]);
    }
  }

  // Pass 3 — aliases.
  for (const field of FIELDS) {
    if (map[field.key] !== undefined) continue;
    const idx = normalised.findIndex(
      (h, i) => !claimed.has(i) && h.length > 0 && field.aliases.includes(h),
    );
    if (idx !== -1) assign(field.key, idx, true, headers[idx]);
  }

  // Pass 4 — last resort, a required field whose alias appears as a prefix or
  // suffix of the header ("availableunits", "brandname"). Deliberately only
  // for required fields: guessing an optional column wrong is worse than
  // leaving it blank, because a wrong price is invisible until a buyer sees it.
  for (const field of FIELDS) {
    if (!field.required || map[field.key] !== undefined) continue;
    const idx = normalised.findIndex(
      (h, i) =>
        !claimed.has(i) &&
        h.length > 2 &&
        field.aliases.some((a) => a.length > 2 && (h.startsWith(a) || h.endsWith(a))),
    );
    if (idx !== -1) assign(field.key, idx, true, headers[idx]);
  }

  const unmatched = headers
    .map((header, index) => ({ index, header }))
    .filter((c) => !claimed.has(c.index) && c.header.length > 0);

  const missingRequired = FIELDS.filter(
    (f) => f.required && map[f.key] === undefined,
  ).map((f) => f.key);

  return { map, headers, unmatched, missingRequired, inferred };
}

/**
 * Find the header row. Owners put a title, a logo or a blank line above it, so
 * scan the first few rows for the one that looks most like headers rather than
 * assuming row 1.
 */
export function findHeaderRow(rows: (string | null)[][], scanDepth = 10): number {
  let best = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(scanDepth, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const { map, missingRequired } = matchHeaders(row);
    const matched = Object.keys(map).length;
    // Weight required coverage heavily — a row matching 3 optional columns is
    // not a header row, a row matching 6 required ones is.
    const score = matched * 2 - missingRequired.length * 3;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
