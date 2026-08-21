import "server-only";
import { all, run, uid, now } from "@/lib/db/core";
import {
  STANDARD_ALPHA_RUN,
  deriveSku,
  isStandardAlphaSubset,
  sizeKey,
  sizeOrder,
} from "@/lib/domain/sizes";

/**
 * Complete partial size runs (the small-invoice problem).
 *
 * An invoice only carries the sizes that shipped, so an article that first
 * appears on one shows a two-size ladder — which reads as broken on the site
 * and gives the owner nothing to adjust when the other sizes arrive. Any
 * article whose sizes sit on the plain XS–4XL ladder is completed to the full
 * standard run at zero stock: visible to buyers as sold out, editable in the
 * admin like any other size.
 *
 * Runs after every import and once per boot (idempotent — the ON CONFLICT
 * means concurrent boots cannot double-insert). Articles on their own ladder
 * (SM/LXL caps, numeric waists, one-size accessories) are left exactly as
 * their files describe them.
 */
export async function completeSizeRuns(): Promise<number> {
  const products = await all<{ id: string; article_number: string }>(
    "SELECT id, article_number FROM products",
  );
  if (products.length === 0) return 0;

  const variants = await all<{ product_id: string; size: string }>(
    "SELECT product_id, size FROM variants",
  );
  const byProduct = new Map<string, string[]>();
  for (const v of variants) {
    const bucket = byProduct.get(v.product_id);
    if (bucket) bucket.push(v.size);
    else byProduct.set(v.product_id, [v.size]);
  }

  const timestamp = now();
  let created = 0;

  for (const product of products) {
    const sizes = byProduct.get(product.id) ?? [];
    if (!isStandardAlphaSubset(sizes)) continue;

    const have = new Set(sizes.map((s) => sizeKey(s)));
    for (const size of STANDARD_ALPHA_RUN) {
      if (have.has(sizeKey(size))) continue;

      const inserted = await run(
        `INSERT INTO variants (id, product_id, sku, size, size_order, quantity, updated_at)
         VALUES (?,?,?,?,?,0,?)
         ON CONFLICT(sku) DO NOTHING`,
        uid(),
        product.id,
        deriveSku(product.article_number, size),
        size,
        sizeOrder(size),
        timestamp,
      );
      created += Number(inserted.changes ?? 0);
    }
  }

  return created;
}
