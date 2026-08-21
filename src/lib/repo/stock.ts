import "server-only";
import { all, audit, get, now, run, transaction, uid } from "@/lib/db";

/**
 * Reading and adjusting stock by hand.
 *
 * The adidas files only ever record goods coming *in* — an invoice is a
 * delivery note, and nothing in either file decrements as stock is sold. So the
 * figures on the site drift upward from reality unless someone corrects them,
 * and over-stating availability is the error that costs a sale twice: once when
 * the buyer specifies something that is not there, and again when the team has
 * to walk it back.
 *
 * Every manual change is written to `stock_adjustments` with a reason, so the
 * owner can always answer why a size says 40 when the shelf holds 36.
 */

/** Why a quantity moved. Deliberately short — a long list gets ignored. */
export const ADJUSTMENT_REASONS = [
  { value: "sale", label: "Sold", hint: "Went out on an order" },
  { value: "stock-take", label: "Stock take", hint: "Counted the shelf" },
  { value: "damage", label: "Damaged or lost", hint: "Written off" },
  { value: "return", label: "Returned", hint: "Came back in" },
  { value: "sample", label: "Sample or giveaway", hint: "Out, but not sold" },
  { value: "correction", label: "Correction", hint: "The figure was simply wrong" },
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]["value"];

const VALID_REASONS = new Set<string>(ADJUSTMENT_REASONS.map((r) => r.value));

export const LOW_STOCK_AT = 10;

export interface StockSize {
  variant_id: string;
  sku: string;
  size: string;
  size_order: number;
  quantity: number;
}

export interface StockArticle {
  id: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  category: string;
  is_visible: number;
  needs_review: number;
  price_wholesale: number | null;
  total: number;
  sizes: StockSize[];
}

export interface StockFilters {
  search?: string;
  /** Only articles with a size in single figures. */
  lowOnly?: boolean;
  /** Only articles with nothing on the shelf at all. */
  emptyOnly?: boolean;
}

export function listStock(filters: StockFilters = {}): StockArticle[] {
  const clauses: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      `(LOWER(p.article_number) LIKE ? OR LOWER(p.style_name) LIKE ?
        OR LOWER(p.colour) LIKE ? OR LOWER(p.brand) LIKE ?)`,
    );
    params.push(q, q, q, q);
  }

  const products = all<{
    id: string;
    article_number: string;
    brand: string;
    style_name: string;
    colour: string;
    category: string;
    is_visible: number;
    needs_review: number;
    price_wholesale: number | null;
  }>(
    `SELECT id, article_number, brand, style_name, colour, category,
            is_visible, needs_review, price_wholesale
       FROM products p
      WHERE ${clauses.join(" AND ")}
      ORDER BY p.article_number ASC`,
    ...params,
  );

  if (products.length === 0) return [];

  // One query for every size, grouped in memory. A few hundred articles (§15.1)
  // is far cheaper this way than a query per row.
  const variants = all<StockSize & { product_id: string }>(
    `SELECT id AS variant_id, product_id, sku, size, size_order, quantity
       FROM variants ORDER BY size_order ASC`,
  );
  const byProduct = new Map<string, StockSize[]>();
  for (const v of variants) {
    const bucket = byProduct.get(v.product_id);
    if (bucket) bucket.push(v);
    else byProduct.set(v.product_id, [v]);
  }

  let articles: StockArticle[] = products.map((p) => {
    const sizes = byProduct.get(p.id) ?? [];
    return { ...p, sizes, total: sizes.reduce((n, s) => n + s.quantity, 0) };
  });

  if (filters.emptyOnly) {
    articles = articles.filter((a) => a.total === 0);
  } else if (filters.lowOnly) {
    // "Low" means a size a buyer could exhaust, not an article with a small
    // total — a run missing its mediums is the thing worth seeing.
    articles = articles.filter((a) =>
      a.sizes.some((s) => s.quantity > 0 && s.quantity < LOW_STOCK_AT),
    );
  }

  return articles;
}

export interface StockCounts {
  articles: number;
  units: number;
  lowSizes: number;
  emptyArticles: number;
  noPrice: number;
  needsReview: number;
  noImage: number;
}

export function getStockCounts(): StockCounts {
  const row = get<StockCounts>(
    `SELECT
       (SELECT COUNT(*) FROM products) AS articles,
       (SELECT COALESCE(SUM(quantity), 0) FROM variants) AS units,
       (SELECT COUNT(*) FROM variants WHERE quantity > 0 AND quantity < ${LOW_STOCK_AT}) AS lowSizes,
       (SELECT COUNT(*) FROM products p
          WHERE NOT EXISTS (SELECT 1 FROM variants v
                             WHERE v.product_id = p.id AND v.quantity > 0)) AS emptyArticles,
       (SELECT COUNT(*) FROM products WHERE price_wholesale IS NULL) AS noPrice,
       (SELECT COUNT(*) FROM products WHERE needs_review = 1) AS needsReview,
       (SELECT COUNT(*) FROM products p
          WHERE NOT EXISTS (SELECT 1 FROM product_images i
                             WHERE i.product_id = p.id)) AS noImage`,
  );
  return (
    row ?? {
      articles: 0,
      units: 0,
      lowSizes: 0,
      emptyArticles: 0,
      noPrice: 0,
      needsReview: 0,
      noImage: 0,
    }
  );
}

/* -------------------------------------------------------------------------
   Adjusting
   ---------------------------------------------------------------------- */

export interface AdjustmentInput {
  variantId: string;
  quantity: number;
}

export interface AdjustmentResult {
  changed: number;
  unchanged: number;
  errors: string[];
}

/**
 * Apply a set of manual quantity changes as one unit of work.
 *
 * Only quantities that actually moved are written, so saving a grid nobody
 * edited does not fill the ledger with no-op rows.
 */
export function adjustStock(
  changes: AdjustmentInput[],
  reason: string,
  note: string | null,
  actor: string,
): AdjustmentResult {
  if (!VALID_REASONS.has(reason)) {
    return { changed: 0, unchanged: 0, errors: ["Choose a reason for the change."] };
  }

  const errors: string[] = [];
  let changed = 0;
  let unchanged = 0;
  const timestamp = now();

  transaction(() => {
    for (const change of changes) {
      const raw = Number(change.quantity);
      if (!Number.isFinite(raw)) {
        errors.push("A quantity was not a number and was left alone.");
        continue;
      }
      const quantity = Math.max(0, Math.floor(raw));

      const variant = get<{
        id: string;
        sku: string;
        size: string;
        quantity: number;
        article_number: string;
      }>(
        `SELECT v.id, v.sku, v.size, v.quantity, p.article_number
           FROM variants v JOIN products p ON p.id = v.product_id
          WHERE v.id = ?`,
        change.variantId,
      );

      if (!variant) {
        errors.push("A size no longer exists and was skipped.");
        continue;
      }

      if (variant.quantity === quantity) {
        unchanged++;
        continue;
      }

      run(
        "UPDATE variants SET quantity = ?, updated_at = ? WHERE id = ?",
        quantity,
        timestamp,
        variant.id,
      );

      run(
        `INSERT INTO stock_adjustments (
           id, sku, article_number, size, quantity_before, quantity_after,
           delta, reason, note, actor, created_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        uid(),
        variant.sku,
        variant.article_number,
        variant.size,
        variant.quantity,
        quantity,
        quantity - variant.quantity,
        reason,
        note,
        actor,
        timestamp,
      );

      changed++;
    }
  });

  if (changed > 0) {
    audit("stock.adjust", reason, { changed, note }, actor);
  }

  return { changed, unchanged, errors };
}

export interface AdjustmentRow {
  id: string;
  sku: string;
  article_number: string;
  size: string;
  quantity_before: number;
  quantity_after: number;
  delta: number;
  reason: string;
  note: string | null;
  actor: string | null;
  created_at: string;
}

export function listAdjustments(limit = 200, articleNumber?: string): AdjustmentRow[] {
  if (articleNumber) {
    return all<AdjustmentRow>(
      `SELECT * FROM stock_adjustments WHERE article_number = ?
        ORDER BY created_at DESC LIMIT ?`,
      articleNumber,
      limit,
    );
  }
  return all<AdjustmentRow>(
    "SELECT * FROM stock_adjustments ORDER BY created_at DESC LIMIT ?",
    limit,
  );
}

export function reasonLabel(value: string): string {
  return ADJUSTMENT_REASONS.find((r) => r.value === value)?.label ?? value;
}
