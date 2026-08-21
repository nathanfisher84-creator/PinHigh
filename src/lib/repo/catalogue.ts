import "server-only";
import { all, get, getSetting } from "@/lib/db";
import { bySizeOrder } from "@/lib/domain/sizes";
import type {
  Category,
  Condition,
  Gender,
  Product,
  ProductImage,
  ProductWithVariants,
  Variant,
} from "@/lib/domain/types";

/* -------------------------------------------------------------------------
   Row mapping
   ---------------------------------------------------------------------- */

type ProductRow = Omit<Product, "is_visible" | "is_discontinued"> & {
  is_visible: number;
  is_discontinued: number;
};

function toProduct(r: ProductRow): Product {
  return {
    ...r,
    is_visible: !!r.is_visible,
    is_discontinued: !!r.is_discontinued,
  };
}

/* -------------------------------------------------------------------------
   Visibility
   ---------------------------------------------------------------------- */

/**
 * Spec §15.7: pre-owned and ex-display stock is excluded from the catalogue by
 * default, with an admin toggle to override. §10 is emphatic that mixing used
 * equipment into a trade catalogue without saying so loses professional
 * buyers, so the default is the safe one and the override is explicit.
 */
function conditionClause(): string {
  return getSetting("show_non_new_stock") === "true" ? "" : " AND p.condition = 'new'";
}

const VISIBLE = "p.is_visible = 1";

/* -------------------------------------------------------------------------
   Filters
   ---------------------------------------------------------------------- */

export interface CatalogueFilters {
  brand?: string[];
  category?: string[];
  gender?: string[];
  colour?: string[];
  condition?: string[];
  inStockOnly?: boolean;
  search?: string;
  sort?: "relevance" | "newest" | "price-asc" | "price-desc" | "name" | "stock";
}

/** A listing card. Where a style_group is set, colourways collapse into one. */
export interface CatalogueCard {
  /** The colourway currently shown on the card. */
  article_number: string;
  style_group: string | null;
  brand: string;
  style_name: string;
  category: Category;
  gender: Gender;
  condition: Condition;
  colour: string;
  colour_hex: string | null;
  price_wholesale: number | null;
  rrp: number | null;
  total_quantity: number;
  /** Sizes with stock, in run order — the availability strip on the card. */
  sizes: { size: string; quantity: number }[];
  image: string | null;
  /** Sibling colourways, including this one. Length 1 when standalone. */
  colourways: {
    article_number: string;
    colour: string;
    colour_hex: string | null;
    total_quantity: number;
    image: string | null;
    condition: Condition;
  }[];
}

interface JoinedRow extends ProductRow {
  total_quantity: number;
  image: string | null;
  sizes_json: string;
}

/**
 * One query for the whole listing. The catalogue is assumed at a few hundred
 * styles (§15.1); above ~2,000 this needs server-side pagination and a search
 * index, and the assumption should be re-tested rather than this query tuned.
 */
function fetchCards(where: string, params: unknown[]): JoinedRow[] {
  return all<JoinedRow>(
    `SELECT p.*,
            COALESCE(v.total_quantity, 0) AS total_quantity,
            CASE WHEN img.storage_path LIKE '/%' THEN img.storage_path
                 ELSE '/images/' || img.storage_path END AS image,
            COALESCE(v.sizes_json, '[]') AS sizes_json
       FROM products p
       LEFT JOIN (
         SELECT product_id,
                SUM(quantity) AS total_quantity,
                json_group_array(
                  json_object('size', size, 'quantity', quantity, 'o', size_order)
                ) AS sizes_json
           FROM variants
          GROUP BY product_id
       ) v ON v.product_id = p.id
       LEFT JOIN (
         SELECT product_id, storage_path,
                ROW_NUMBER() OVER (
                  PARTITION BY product_id ORDER BY is_primary DESC, sort_order ASC
                ) AS rn
           FROM product_images
       ) img ON img.product_id = p.id AND img.rn = 1
      WHERE ${where}
      ORDER BY p.sort_order ASC, p.brand ASC, p.style_name ASC, p.colour ASC`,
    ...params,
  );
}

function parseSizes(json: string): { size: string; quantity: number }[] {
  try {
    const raw = JSON.parse(json) as { size: string; quantity: number; o: number }[];
    return raw
      .sort((a, b) => a.o - b.o)
      .map(({ size, quantity }) => ({ size, quantity }));
  } catch {
    return [];
  }
}

/**
 * Collapse sibling colourways into one card (§6.2).
 *
 * The card shows the primary colourway — the one with the most stock, since
 * that is the one a buyer can actually order a run of — and swatches switch
 * the image and article number in place. A null style_group must never
 * degrade anything (§3), so those rows simply pass through as single-colourway
 * cards on the same code path.
 */
function collapse(rows: JoinedRow[]): CatalogueCard[] {
  const groups = new Map<string, JoinedRow[]>();

  for (const row of rows) {
    // Standalone products get a key that cannot collide with a style group.
    const key = row.style_group ? `g:${row.style_group}` : `a:${row.article_number}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const cards: CatalogueCard[] = [];

  for (const bucket of groups.values()) {
    // Lead with the colourway a buyer is most likely to be able to fill a run
    // from; fall back to having an image, then to a stable alphabetical order.
    const ordered = [...bucket].sort(
      (a, b) =>
        b.total_quantity - a.total_quantity ||
        Number(!!b.image) - Number(!!a.image) ||
        a.colour.localeCompare(b.colour),
    );
    const lead = ordered[0];

    cards.push({
      article_number: lead.article_number,
      style_group: lead.style_group,
      brand: lead.brand,
      style_name: lead.style_name,
      category: lead.category,
      gender: lead.gender,
      condition: lead.condition,
      colour: lead.colour,
      colour_hex: lead.colour_hex,
      price_wholesale: lead.price_wholesale,
      rrp: lead.rrp,
      total_quantity: lead.total_quantity,
      sizes: parseSizes(lead.sizes_json),
      image: lead.image,
      colourways: ordered.map((r) => ({
        article_number: r.article_number,
        colour: r.colour,
        colour_hex: r.colour_hex,
        total_quantity: r.total_quantity,
        image: r.image,
        condition: r.condition,
      })),
    });
  }

  return cards;
}

export function listCatalogue(filters: CatalogueFilters = {}): CatalogueCard[] {
  const clauses = [VISIBLE];
  const params: unknown[] = [];

  const inClause = (column: string, values?: string[]) => {
    if (!values?.length) return;
    clauses.push(`${column} IN (${values.map(() => "?").join(",")})`);
    params.push(...values);
  };

  inClause("p.brand", filters.brand);
  inClause("p.category", filters.category);
  inClause("p.gender", filters.gender);
  inClause("p.condition", filters.condition);

  if (filters.colour?.length) {
    // Colour is matched loosely: a buyer filtering "Navy" wants "Collegiate
    // Navy" and "Navy Blazer" too, because those are the same request.
    const parts = filters.colour.map(() => "LOWER(p.colour) LIKE ?");
    clauses.push(`(${parts.join(" OR ")})`);
    params.push(...filters.colour.map((c) => `%${c.toLowerCase()}%`));
  }

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      `(LOWER(p.style_name) LIKE ? OR LOWER(p.colour) LIKE ? OR LOWER(p.article_number) LIKE ?
        OR LOWER(p.brand) LIKE ?
        OR EXISTS (SELECT 1 FROM variants sv WHERE sv.product_id = p.id AND LOWER(sv.sku) LIKE ?))`,
    );
    params.push(q, q, q, q, q);
  }

  let where = clauses.join(" AND ") + conditionClause();

  // "In stock only" is applied after grouping so a card is kept when *any* of
  // its colourways has stock — hiding the whole style because the lead colour
  // sold out would be wrong.
  const rows = fetchCards(where, params);
  let cards = collapse(rows);

  if (filters.inStockOnly) {
    cards = cards
      .filter((c) => c.colourways.some((cw) => cw.total_quantity > 0))
      .map((c) => {
        if (c.total_quantity > 0) return c;
        const withStock = c.colourways.find((cw) => cw.total_quantity > 0);
        if (!withStock) return c;
        // Lead with a colourway the buyer can actually order.
        const swapped = rows.find((r) => r.article_number === withStock.article_number);
        return swapped
          ? { ...c, ...pickLead(swapped), colourways: c.colourways }
          : c;
      });
  }

  return sortCards(cards, filters);
}

function pickLead(r: JoinedRow) {
  return {
    article_number: r.article_number,
    colour: r.colour,
    colour_hex: r.colour_hex,
    total_quantity: r.total_quantity,
    sizes: parseSizes(r.sizes_json),
    image: r.image,
    condition: r.condition,
  };
}

function sortCards(cards: CatalogueCard[], filters: CatalogueFilters): CatalogueCard[] {
  const sorted = [...cards];
  switch (filters.sort) {
    case "price-asc":
      return sorted.sort(
        (a, b) => (a.price_wholesale ?? Infinity) - (b.price_wholesale ?? Infinity),
      );
    case "price-desc":
      return sorted.sort(
        (a, b) => (b.price_wholesale ?? -Infinity) - (a.price_wholesale ?? -Infinity),
      );
    case "name":
      return sorted.sort((a, b) => a.style_name.localeCompare(b.style_name));
    case "stock":
      return sorted.sort((a, b) => b.total_quantity - a.total_quantity);
    default:
      // Default ordering puts anything a buyer can actually order first. A
      // catalogue whose first screen is sold out reads as a dead business.
      return sorted.sort(
        (a, b) =>
          Number(b.total_quantity > 0) - Number(a.total_quantity > 0) ||
          a.brand.localeCompare(b.brand) ||
          a.style_name.localeCompare(b.style_name),
      );
  }
}

/* -------------------------------------------------------------------------
   Product detail
   ---------------------------------------------------------------------- */

export function getProductByArticle(
  articleNumber: string,
): ProductWithVariants | null {
  const row = get<ProductRow>(
    `SELECT * FROM products WHERE article_number = ? AND is_visible = 1`,
    articleNumber,
  );
  if (!row) return null;

  const product = toProduct(row);

  const variants = all<Variant>(
    `SELECT * FROM variants WHERE product_id = ? ORDER BY size_order ASC`,
    product.id,
  ).sort(bySizeOrder);

  const images = all<Omit<ProductImage, "is_primary"> & { is_primary: number }>(
    `SELECT * FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC`,
    product.id,
  ).map((i) => ({ ...i, is_primary: !!i.is_primary }));

  // Sibling colourways. When style_group is null this is empty and the product
  // simply stands alone — no function may depend on the grouping (§3).
  const siblings = product.style_group
    ? all<{
        article_number: string;
        colour: string;
        colour_hex: string | null;
        total_quantity: number;
        primary_image: string | null;
      }>(
        `SELECT p.article_number, p.colour, p.colour_hex,
                COALESCE((SELECT SUM(quantity) FROM variants v WHERE v.product_id = p.id), 0)
                  AS total_quantity,
                (SELECT CASE WHEN storage_path LIKE '/%' THEN storage_path
                             ELSE '/images/' || storage_path END
                   FROM product_images i
                  WHERE i.product_id = p.id
                  ORDER BY i.is_primary DESC, i.sort_order ASC LIMIT 1) AS primary_image
           FROM products p
          WHERE p.style_group = ? AND p.is_visible = 1
          ORDER BY p.colour ASC`,
        product.style_group,
      )
    : [];

  return { ...product, variants, images, siblings };
}

/**
 * Every colourway of a style, each with its own full size run.
 *
 * The colour switcher swaps the grid to that article number's own size run and
 * stock (§6.3), so all of them are loaded up front — switching a swatch must
 * be instant, and a buyer comparing three colours is the normal case, not an
 * edge one.
 */
export interface ColourwayRun {
  article_number: string;
  colour: string;
  colour_hex: string | null;
  condition: Condition;
  price_wholesale: number | null;
  rrp: number | null;
  case_pack: number | null;
  moq: number | null;
  category: Category;
  total_quantity: number;
  image: string | null;
  variants: { sku: string; size: string; size_order: number; quantity: number }[];
}

export function getColourwayRuns(product: ProductWithVariants): ColourwayRun[] {
  const articles = product.style_group
    ? all<ProductRow>(
        `SELECT * FROM products WHERE style_group = ? AND is_visible = 1 ORDER BY colour ASC`,
        product.style_group,
      ).map(toProduct)
    : [product];

  // A standalone product still goes through this path, so nothing downstream
  // needs to know whether a style group exists (§3).
  return articles.map((p) => {
    const variants = all<{ sku: string; size: string; size_order: number; quantity: number }>(
      `SELECT sku, size, size_order, quantity FROM variants
        WHERE product_id = ? ORDER BY size_order ASC`,
      p.id,
    );
    const image = get<{ storage_path: string }>(
      `SELECT CASE WHEN storage_path LIKE '/%' THEN storage_path
                   ELSE '/images/' || storage_path END AS storage_path
         FROM product_images WHERE product_id = ?
        ORDER BY is_primary DESC, sort_order ASC LIMIT 1`,
      p.id,
    );
    return {
      article_number: p.article_number,
      colour: p.colour,
      colour_hex: p.colour_hex,
      condition: p.condition,
      price_wholesale: p.price_wholesale,
      rrp: p.rrp,
      case_pack: p.case_pack,
      moq: p.moq,
      category: p.category,
      total_quantity: variants.reduce((n, v) => n + v.quantity, 0),
      image: image?.storage_path ?? null,
      variants,
    };
  });
}

/** Placements the owner has enabled for a category (§8). */
export function getBrandingPlacements(category: string): string[] {
  return all<{ label: string }>(
    `SELECT label FROM branding_placements
      WHERE category = ? AND is_active = 1 ORDER BY sort_order ASC`,
    category,
  ).map((r) => r.label);
}

/** Exact article-number lookup for search. Must rank first and jump straight
 *  to the product (§6.2) — buyers paste article numbers in constantly. */
export function findExactArticle(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const row = get<{ article_number: string }>(
    `SELECT article_number FROM products
      WHERE (LOWER(article_number) = LOWER(?)
             OR EXISTS (SELECT 1 FROM variants v
                         WHERE v.product_id = products.id AND LOWER(v.sku) = LOWER(?)))
        AND is_visible = 1
      LIMIT 1`,
    q,
    q,
  );
  return row?.article_number ?? null;
}

/* -------------------------------------------------------------------------
   Facets
   ---------------------------------------------------------------------- */

export interface Facet {
  value: string;
  label: string;
  count: number;
}

function facet(column: string): Facet[] {
  return all<{ value: string; count: number }>(
    `SELECT ${column} AS value, COUNT(*) AS count
       FROM products p
      WHERE ${VISIBLE}${conditionClause()} AND ${column} IS NOT NULL AND ${column} <> ''
      GROUP BY ${column}
      ORDER BY count DESC, value ASC`,
  ).map((r) => ({ value: r.value, label: r.value, count: r.count }));
}

export function getFacets() {
  return {
    brands: facet("p.brand"),
    categories: facet("p.category"),
    genders: facet("p.gender"),
    conditions: facet("p.condition"),
  };
}

/** Brands with a product count, for the home page logo strip and brand pages. */
export function listBrands(): Facet[] {
  return facet("p.brand");
}

export function getCategoryCounts(): Map<string, number> {
  const rows = all<{ category: string; count: number }>(
    `SELECT category, COUNT(*) AS count FROM products p
      WHERE ${VISIBLE}${conditionClause()} GROUP BY category`,
  );
  return new Map(rows.map((r) => [r.category, r.count]));
}

/* -------------------------------------------------------------------------
   Live stock check — used by the review page and on submission (§6.4, §7.2)
   ---------------------------------------------------------------------- */

export interface LiveVariant {
  sku: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  size: string;
  quantity: number;
  price_wholesale: number | null;
  case_pack: number | null;
  moq: number | null;
  category: string;
  is_visible: number;
}

export function getVariantsBySku(skus: string[]): Map<string, LiveVariant> {
  if (skus.length === 0) return new Map();
  const rows = all<LiveVariant>(
    `SELECT v.sku, v.size, v.quantity,
            p.article_number, p.brand, p.style_name, p.colour,
            p.price_wholesale, p.case_pack, p.moq, p.category, p.is_visible
       FROM variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.sku IN (${skus.map(() => "?").join(",")})`,
    ...skus,
  );
  return new Map(rows.map((r) => [r.sku, r]));
}

/**
 * Headline figures for the landing page.
 *
 * A distributor's stock position is the most persuasive thing it has, so these
 * are rendered at full size rather than tucked into a badge. Counts respect the
 * same visibility rules as the catalogue, so the number on the home page and
 * the number of things you can actually order never disagree.
 */
export function getCatalogueTotals(): {
  units: number;
  articles: number;
  sizes: number;
} {
  const row = get<{ units: number; articles: number; sizes: number }>(
    `SELECT COALESCE(SUM(v.quantity), 0) AS units,
            COUNT(DISTINCT p.id)         AS articles,
            COUNT(v.id)                  AS sizes
       FROM products p
       LEFT JOIN variants v ON v.product_id = p.id
      WHERE ${VISIBLE}${conditionClause()}`,
  );
  return {
    units: row?.units ?? 0,
    articles: row?.articles ?? 0,
    sizes: row?.sizes ?? 0,
  };
}

export function getStockAsAt(): string | null {
  const value = getSetting("last_import_at");
  return value || null;
}
