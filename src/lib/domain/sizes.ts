/**
 * Canonical size ordering (spec §4.3).
 *
 * "Never sort alphabetically." A size run read out of order is worse than no
 * size run — a buyer scanning L, M, S, XL, XS cannot see the shape of the
 * stock, which is the entire point of the grid.
 *
 * Order is: lettered sizes on their canonical ladder, then numeric sizes
 * ascending, then anything unrecognised, then ONE last.
 *
 * `size_order` is computed once at import and stored, so display never has to
 * re-derive it and every surface agrees.
 */

const BAND_ALPHA = 1_000;
const BAND_NUMERIC = 4_000;
const BAND_UNKNOWN = 8_000;
const BAND_ONE = 9_000;

/**
 * The lettered ladder. Glove sizing puts ML between M and L, and waist-style
 * SM/LXL show up on outerwear, so they sit on the ladder rather than falling
 * through to the unknown band.
 */
const ALPHA_LADDER = [
  "3XS",
  "XXS",
  "XS",
  "XSS",
  "S",
  "SM",
  "M",
  "ML",
  "L",
  "LXL",
  "XL",
  "XXL",
  "3XL",
  "4XL",
  "5XL",
];

/** Spellings that mean the same size. Normalised before laddering. */
const ALPHA_ALIASES: Record<string, string> = {
  "2XS": "XXS",
  XXXS: "3XS",
  "2XL": "XXL",
  XXXL: "3XL",
  "4XLT": "4XL",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  "X-SMALL": "XS",
  "X-LARGE": "XL",
  "MEDIUM-LARGE": "ML",
  "SMALL-MEDIUM": "SM",
};

/** Spellings that mean "this product has no size". */
const ONE_SIZE = new Set([
  "ONE",
  "ONESIZE",
  "ONE SIZE",
  "OS",
  "O/S",
  "N/A",
  "NA",
  "-",
  "STD",
  "STANDARD",
  "UNI",
  "UNIVERSAL",
]);

/** Uppercase, collapse whitespace, drop decorative punctuation. */
export function normaliseSize(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[."']/g, (m) => (m === "." ? "." : ""))
    .replace(/^SIZE\s+/, "")
    .trim();
}

/**
 * Compute the sort key for a size. Stable, total, and safe on junk input —
 * an unrecognised size sorts into its own band rather than throwing, because
 * a single odd cell in a 10,000-row spreadsheet must not fail the import.
 */
export function sizeOrder(raw: string): number {
  const s = normaliseSize(raw);
  if (!s) return BAND_UNKNOWN;

  if (ONE_SIZE.has(s)) return BAND_ONE;

  const alphaKey = ALPHA_ALIASES[s] ?? s;
  const ladderIndex = ALPHA_LADDER.indexOf(alphaKey);
  if (ladderIndex !== -1) return BAND_ALPHA + ladderIndex * 10;

  // Numeric sizes: waists (30, 32), shoe sizes (8.5), putter lengths (33).
  // Scaled by 10 so half sizes keep their place as integers.
  const numeric = s.match(/^(\d{1,3})(?:[.,](\d))?$/);
  if (numeric) {
    const whole = Number(numeric[1]);
    const half = numeric[2] ? Number(numeric[2]) : 0;
    return BAND_NUMERIC + whole * 10 + half;
  }

  // Junior age ranges: "7-8 YRS", "5-6".
  const age = s.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (age) return BAND_NUMERIC + Number(age[1]) * 10;

  // Unrecognised. Keep it deterministic by seeding from the string so two
  // imports of the same file always produce the same order.
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 900;
  return BAND_UNKNOWN + hash;
}

/** Sort variants (or anything size-shaped) into canonical run order. */
export function bySizeOrder<T extends { size_order?: number; size: string }>(
  a: T,
  b: T,
): number {
  const ao = a.size_order ?? sizeOrder(a.size);
  const bo = b.size_order ?? sizeOrder(b.size);
  if (ao !== bo) return ao - bo;
  return a.size.localeCompare(b.size);
}

/**
 * The default apparel run, in the spelling the adidas files use. When an
 * article arrives on a small invoice carrying only the sizes that shipped,
 * the catalogue completes it to this run at zero stock — a buyer should see
 * the whole ladder with sold-out sizes marked, not a mysteriously short one,
 * and the owner must be able to correct any size the moment goods arrive.
 */
export const STANDARD_ALPHA_RUN = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;

/** Canonical identity for a size: "2XL" and "XXL" are the same rung. */
export function sizeKey(raw: string): string {
  const s = normaliseSize(raw);
  return ALPHA_ALIASES[s] ?? s;
}

const STANDARD_KEYS = new Set(STANDARD_ALPHA_RUN.map((s) => sizeKey(s)));

/**
 * True when every existing size sits on the plain XS–4XL ladder. Only then is
 * completing to the standard run safe: a cap sized SM/LXL or a numeric-waist
 * trouser has its own run, and padding it with XS–4XL would be invention.
 */
export function isStandardAlphaSubset(sizes: string[]): boolean {
  return sizes.length > 0 && sizes.every((s) => STANDARD_KEYS.has(sizeKey(s)));
}

/**
 * Derive the SKU (spec §4.1) — never expect one in the file.
 * `{article_number}-{size slug}`, uppercased, non-alphanumerics to hyphens.
 */
export function deriveSku(articleNumber: string, size: string): string {
  const slug = (s: string) =>
    String(s ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${slug(articleNumber)}-${slug(size)}`;
}

/**
 * Stock depth, bucketed for the availability bar under each grid cell.
 * The bar's job is to let a buyer read the health of a whole size run before
 * reading a single number, so the buckets are coarse on purpose.
 */
export type StockLevel = "out" | "low" | "medium" | "good" | "deep";

export const LOW_STOCK_THRESHOLD = 10;

export function stockLevel(quantity: number): StockLevel {
  if (quantity <= 0) return "out";
  if (quantity < LOW_STOCK_THRESHOLD) return "low";
  if (quantity < 25) return "medium";
  if (quantity < 60) return "good";
  return "deep";
}

/** Bar height as a percentage, for the sparkline beneath a grid cell. */
export function stockBarHeight(quantity: number, max: number): number {
  if (quantity <= 0) return 0;
  if (max <= 0) return 0;
  // Square root keeps a run of 4 visible next to a run of 90 without letting
  // the deep sizes flatten everything else to nothing.
  const ratio = Math.sqrt(quantity) / Math.sqrt(Math.max(max, 1));
  return Math.max(8, Math.round(ratio * 100));
}
