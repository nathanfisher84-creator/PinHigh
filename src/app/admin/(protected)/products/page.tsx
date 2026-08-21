import Link from "next/link";
import { all } from "@/lib/db";
import { ProductTable } from "@/components/admin/ProductTable";
import { BulkImageUpload } from "@/components/admin/BulkImageUpload";
import type { ProductImageRow } from "@/lib/repo/images";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface AdminProductRow {
  id: string;
  article_number: string;
  brand: string;
  style_group: string | null;
  style_name: string;
  colour: string;
  colour_hex: string | null;
  category: string;
  gender: string;
  condition: string;
  description: string | null;
  fabric: string | null;
  season: string | null;
  price_wholesale: number | null;
  rrp: number | null;
  case_pack: number | null;
  moq: number | null;
  is_visible: number;
  is_discontinued: number;
  needs_review: number;
  cost_price: number | null;
  sort_order: number;
  total_quantity: number;
  image_count: number;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const hidden = params.hidden === "1";

  const clauses: string[] = ["1=1"];
  const args: unknown[] = [];

  if (search) {
    const q = `%${search.toLowerCase()}%`;
    clauses.push(
      "(LOWER(p.style_name) LIKE ? OR LOWER(p.colour) LIKE ? OR LOWER(p.article_number) LIKE ? OR LOWER(p.brand) LIKE ?)",
    );
    args.push(q, q, q, q);
  }
  if (category) {
    clauses.push("p.category = ?");
    args.push(category);
  }
  if (hidden) clauses.push("p.is_visible = 0");

  const products = await all<AdminProductRow>(
    `SELECT p.*,
            COALESCE((SELECT SUM(quantity) FROM variants v WHERE v.product_id = p.id), 0)
              AS total_quantity,
            (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id) AS image_count
       FROM products p
      WHERE ${clauses.join(" AND ")}
      ORDER BY p.brand ASC, p.style_name ASC, p.colour ASC
      LIMIT 1000`,
    ...args,
  );

  // One query for every image, grouped in memory. The catalogue is a few
  // hundred styles (§15.1), so this is cheaper than a query per row.
  const imageRows = await all<ProductImageRow>(
    "SELECT * FROM product_images ORDER BY is_primary DESC, sort_order ASC",
  );
  const imagesByProduct: Record<string, ProductImageRow[]> = {};
  for (const row of imageRows) {
    (imagesByProduct[row.product_id] ??= []).push(row);
  }

  const withoutImages = products.filter((p) => p.image_count === 0).length;
  const needingDetails = products.filter((p) => p.needs_review);

  return (
    <div>
      <h1 className="text-2xl">Products</h1>
      <p className="mt-2 max-w-2xl text-sm text-graphite-ink">
        Names, prices and visibility. Stock quantities come from the adidas
        upload and are edited there, not here.
      </p>

      {/*
        An adidas invoice carries article numbers, sizes and quantities and
        nothing else — no product name, colour, category or gender. Those
        articles are live on the site under their article number, which a trade
        buyer can work with, but they need a real name before they read well.
      */}
      {needingDetails.length > 0 && (
        <section className="mt-6 hairline border-flag bg-flag-wash px-4 py-4">
          <h2 className="font-medium">
            {needingDetails.length}{" "}
            {needingDetails.length === 1 ? "product needs" : "products need"} a name
            and colour
          </h2>
          <p className="mt-1 text-sm">
            These came from an adidas invoice, which does not carry product
            details. They are on the site under their article number. Add a name,
            colour, category and your selling price and they will read properly.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {needingDetails.map((p) => (
              <a
                key={p.id}
                href={`?q=${encodeURIComponent(p.article_number)}`}
                className="tabular hairline bg-paper px-2.5 py-1 text-xs hover:border-fairway"
              >
                {p.article_number}
              </a>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="text-lg">Add photos in bulk</h2>
          {withoutImages > 0 && (
            <p className="text-sm text-graphite-ink">
              <strong className="tabular">{withoutImages}</strong>{" "}
              {withoutImages === 1 ? "product has" : "products have"} no photo yet
            </p>
          )}
        </div>
        <BulkImageUpload />
      </section>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label htmlFor="q" className="label-caps block mb-1">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Style, colour, brand or article number"
            className="w-full hairline bg-paper-raised px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </div>

        <div>
          <label htmlFor="category" className="label-caps block mb-1">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category}
            className="hairline bg-paper-raised px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c as Category]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            name="hidden"
            value="1"
            defaultChecked={hidden}
            className="h-4 w-4 accent-[var(--color-fairway)]"
          />
          Hidden only
        </label>

        <button
          type="submit"
          className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150"
        >
          Filter
        </button>
        <Link
          href="/admin/products"
          className="text-sm text-graphite-ink underline underline-offset-2 pb-2"
        >
          Clear
        </Link>
      </form>

      <p className="tabular mt-4 text-sm text-graphite-ink">
        {products.length} {products.length === 1 ? "product" : "products"}
      </p>

      <div className="mt-4">
        <ProductTable products={products} imagesByProduct={imagesByProduct} />
      </div>
    </div>
  );
}
