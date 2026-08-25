import "server-only";
import { all, get, getSetting } from "@/lib/db";
import { bySizeOrder } from "@/lib/domain/sizes";
import {
  displayStyleName,
  displayStyleNameInText,
  storedStyleNamesForQuery,
} from "@/lib/domain/display-name";
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
async function conditionClause(): Promise<string> {
  return await getSetting("show_non_new_stock") === "true" ? "" : " AND p.condition = 'new'";
}

/**
 * Buyer-facing rows only. `is_visible` is the owner's publish toggle;
 * `needs_review` is the importer holding pen (uncategorised names land in
 * Accessories and stay flagged). A trade buyer must not see either.
 */
const VISIBLE = "p.is_visible = 1 AND p.needs_review = 0";
const VISIBLE_UNALIASED = "is_visible = 1 AND needs_review = 0";

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
  sort?: "relevance" | "newest" | "name" | "stock";
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
async function fetchCards(where: string, params: unknown[]): Promise<JoinedRow[]> {
  return await all<JoinedRow>(
    `SELECT p.*,
            COALESCE(v.total_quantity, 0) AS total_quantity,
            CASE WHEN img.storage_path LIKE '/%' OR img.storage_path LIKE 'http%'
                 THEN img.storage_path
                 ELSE '/images/' || img.storage_path END AS image,
            COALESCE(v.sizes_json, '[]') AS sizes_json
       FROM products p
       LEFT JOIN (
         SELECT product_id,
                SUM(quantity) AS total_quantity,
                json_agg(
                  json_build_object('size', size, 'quantity', quantity, 'o', size_order)
                )::text AS sizes_json
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
      style_name: displayStyleName(lead.style_name),
      category: lead.category,
      gender: lead.gender,
      condition: lead.condition,
      colour: lead.colour,
      colour_hex: lead.colour_hex,
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

export async function listCatalogue(filters: CatalogueFilters = {}): Promise<CatalogueCard[]> {
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
    const aliased = storedStyleNamesForQuery(filters.search.trim());
    const aliasSql = aliased.length
      ? ` OR LOWER(p.style_name) IN (${aliased.map(() => "?").join(",")})`
      : "";
    clauses.push(
      `(LOWER(p.style_name) LIKE ? OR LOWER(p.colour) LIKE ? OR LOWER(p.article_number) LIKE ?
        OR LOWER(p.brand) LIKE ?
        OR EXISTS (SELECT 1 FROM variants sv WHERE sv.product_id = p.id AND LOWER(sv.sku) LIKE ?)${aliasSql})`,
    );
    params.push(q, q, q, q, q, ...aliased);
  }

  let where = clauses.join(" AND ") + (await conditionClause());

  // "In stock only" is applied after grouping so a card is kept when *any* of
  // its colourways has stock — hiding the whole style because the lead colour
  // sold out would be wrong.
  const rows = await fetchCards(where, params);
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

export async function getProductByArticle(
  articleNumber: string,
): Promise<ProductWithVariants | null> {
  const row = await get<ProductRow>(
    `SELECT * FROM products WHERE article_number = ? AND ${VISIBLE_UNALIASED}`,
    articleNumber,
  );
  if (!row) return null;

  const product = toProduct(row);

  const variants = (
    await all<Variant>(
      `SELECT * FROM variants WHERE product_id = ? ORDER BY size_order ASC`,
      product.id,
    )
  ).sort(bySizeOrder);

  const images = (
    await all<Omit<ProductImage, "is_primary"> & { is_primary: number }>(
      `SELECT * FROM product_images WHERE product_id = ?
        ORDER BY is_primary DESC, sort_order ASC`,
      product.id,
    )
  ).map((i) => ({ ...i, is_primary: !!i.is_primary }));

  // Sibling colourways. When style_group is null this is empty and the product
  // simply stands alone — no function may depend on the grouping (§3).
  const siblings = product.style_group
    ? await all<{
        article_number: string;
        colour: string;
        colour_hex: string | null;
        total_quantity: number;
        primary_image: string | null;
      }>(
        `SELECT p.article_number, p.colour, p.colour_hex,
                COALESCE((SELECT SUM(quantity) FROM variants v WHERE v.product_id = p.id), 0)
                  AS total_quantity,
                (SELECT CASE WHEN storage_path LIKE '/%' OR storage_path LIKE 'http%'
                             THEN storage_path
                             ELSE '/images/' || storage_path END
                   FROM product_images i
                  WHERE i.product_id = p.id
                  ORDER BY i.is_primary DESC, i.sort_order ASC LIMIT 1) AS primary_image
           FROM products p
          WHERE p.style_group = ? AND ${VISIBLE}
          ORDER BY p.colour ASC`,
        product.style_group,
      )
    : [];

  return {
    ...product,
    style_name: displayStyleName(product.style_name),
    variants,
    images,
    siblings,
  };
}

/**
 * Every colourway of a style, each with its own full size run.
 *
 * The colour switcher swaps the grid to that article number's own size run and
 * stock (§6.3), so all of them are loaded up front — switching a swatch must
 * be instant, and a buyer comparing three colours is the normal case, not an
 * edge one.
 */
/**
 * One colourway's size run, as sent to the client-side order panel.
 *
 * Deliberately carries no price fields: this object is serialised into the
 * page payload, and the no-public-prices rule covers view-source as much as
 * the rendered page. The server re-prices every line at submission.
 */
export interface ColourwayRun {
  article_number: string;
  colour: string;
  colour_hex: string | null;
  condition: Condition;
  case_pack: number | null;
  moq: number | null;
  category: Category;
  total_quantity: number;
  image: string | null;
  /** Every photograph of this colourway, primary first — the supplier packs
   *  carry multiple angles and §5 says the buyer sees all of them. */
  images: { url: string; alt: string | null }[];
  variants: { sku: string; size: string; size_order: number; quantity: number }[];
}

export async function getColourwayRuns(product: ProductWithVariants): Promise<ColourwayRun[]> {
  const articles = product.style_group
    ? (
        await all<ProductRow>(
          `SELECT * FROM products WHERE style_group = ? AND ${VISIBLE_UNALIASED} ORDER BY colour ASC`,
          product.style_group,
        )
      ).map(toProduct)
    : [product];

  // A standalone product still goes through this path, so nothing downstream
  // needs to know whether a style group exists (§3).
  return Promise.all(
    articles.map(async (p) => {
    const variants = await all<{ sku: string; size: string; size_order: number; quantity: number }>(
      `SELECT sku, size, size_order, quantity FROM variants
        WHERE product_id = ? ORDER BY size_order ASC`,
      p.id,
    );
    const imageRows = await all<{ storage_path: string; alt_text: string | null }>(
      `SELECT CASE WHEN storage_path LIKE '/%' OR storage_path LIKE 'http%'
                   THEN storage_path
                   ELSE '/images/' || storage_path END AS storage_path,
              alt_text
         FROM product_images WHERE product_id = ?
        ORDER BY is_primary DESC, sort_order ASC`,
      p.id,
    );
    const images = imageRows.map((r) => ({
      url: r.storage_path,
      alt: r.alt_text ? displayStyleNameInText(r.alt_text) : r.alt_text,
    }));
    return {
      article_number: p.article_number,
      colour: p.colour,
      colour_hex: p.colour_hex,
      condition: p.condition,
      case_pack: p.case_pack,
      moq: p.moq,
      category: p.category,
      total_quantity: variants.reduce((n, v) => n + v.quantity, 0),
      image: images[0]?.url ?? null,
      images,
      variants,
    };
    }),
  );
}

/** Placements the owner has enabled for a category (§8). */
export async function getBrandingPlacements(category: string): Promise<string[]> {
  return (
    await all<{ label: string }>(
      `SELECT label FROM branding_placements
        WHERE category = ? AND is_active = 1 ORDER BY sort_order ASC`,
      category,
    )
  ).map((r) => r.label);
}

/** Exact article-number lookup for search. Must rank first and jump straight
 *  to the product (§6.2) — buyers paste article numbers in constantly. */
export async function findExactArticle(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  const row = await get<{ article_number: string }>(
    `SELECT article_number FROM products
      WHERE (LOWER(article_number) = LOWER(?)
             OR EXISTS (SELECT 1 FROM variants v
                         WHERE v.product_id = products.id AND LOWER(v.sku) = LOWER(?)))
        AND ${VISIBLE_UNALIASED}
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

async function facet(column: string): Promise<Facet[]> {
  const rows = await all<{ value: string; count: number }>(
    `SELECT ${column} AS value, COUNT(*) AS count
       FROM products p
      WHERE ${VISIBLE}${await conditionClause()} AND ${column} IS NOT NULL AND ${column} <> ''
      GROUP BY ${column}
      ORDER BY count DESC, value ASC`,
  );
  return rows.map((r) => ({ value: r.value, label: r.value, count: r.count }));
}

export async function getFacets() {
  const [brands, categories, genders, conditions] = await Promise.all([
    facet("p.brand"),
    facet("p.category"),
    facet("p.gender"),
    facet("p.condition"),
  ]);
  return { brands, categories, genders, conditions };
}

/** Brands with a product count, for the home page logo strip and brand pages. */
export function listBrands(): Promise<Facet[]> {
  return facet("p.brand");
}

export async function getCategoryCounts(): Promise<Map<string, number>> {
  const rows = await all<{ category: string; count: number }>(
    `SELECT category, COUNT(*) AS count FROM products p
      WHERE ${VISIBLE}${await conditionClause()} GROUP BY category`,
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
  rrp: number | null;
  case_pack: number | null;
  moq: number | null;
  category: string;
  is_visible: number;
}

export async function getVariantsBySku(skus: string[]): Promise<Map<string, LiveVariant>> {
  if (skus.length === 0) return new Map();
  const rows = await all<LiveVariant>(
    `SELECT v.sku, v.size, v.quantity,
            p.article_number, p.brand, p.style_name, p.colour,
            p.price_wholesale, p.rrp, p.case_pack, p.moq, p.category, p.is_visible
       FROM variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.sku IN (${skus.map(() => "?").join(",")})`,
    ...skus,
  );
  return new Map(rows.map((r) => [r.sku, r]));
}

/**
 * Warehouse headline figures — admin and reports only.
 *
 * Buyers never see a catalogue-wide unit count. The public size grid still
 * shows what is available on each article.
 */
export async function getCatalogueTotals(): Promise<{
  units: number;
  articles: number;
  sizes: number;
}> {
  const row = await get<{ units: number; articles: number; sizes: number }>(
    `SELECT COALESCE(SUM(v.quantity), 0) AS units,
            COUNT(DISTINCT p.id)         AS articles,
            COUNT(v.id)                  AS sizes
       FROM products p
       LEFT JOIN variants v ON v.product_id = p.id
      WHERE ${VISIBLE}${await conditionClause()}`,
  );
  return {
    units: row?.units ?? 0,
    articles: row?.articles ?? 0,
    sizes: row?.sizes ?? 0,
  };
}

export async function getStockAsAt(): Promise<string | null> {
  const value = await getSetting("last_import_at");
  return value || null;
}
