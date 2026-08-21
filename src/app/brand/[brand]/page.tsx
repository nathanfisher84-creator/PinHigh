import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCatalogue, getFacets, listBrands } from "@/lib/repo/catalogue";
import { FilterBar } from "@/components/catalogue/FilterBar";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Brand landing page (spec §6.2).
 *
 * "Brand is how trade buyers navigate — a buyer wants adidas polos, not polos.
 * Give brands their own landing pages." Matching is case-insensitive against
 * the stored brand so /brand/adidas and /brand/ADIDAS both resolve, since these
 * URLs get typed and pasted by hand.
 */

type Params = Promise<{ brand: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function resolveBrand(slug: string): string | null {
  const target = decodeURIComponent(slug).toLowerCase();
  return listBrands().find((b) => b.value.toLowerCase() === target)?.value ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { brand } = await params;
  const resolved = resolveBrand(brand);
  if (!resolved) return { title: "Brand not found" };
  return {
    title: `${resolved} golf kit for UAE companies`,
    description: `${resolved} apparel, footwear and equipment held in stock in Dubai and quoted for corporate quantities.`,
    alternates: { canonical: `/brand/${encodeURIComponent(resolved.toLowerCase())}` },
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { brand } = await params;
  const resolved = resolveBrand(brand);
  if (!resolved) notFound();

  const query = await searchParams;
  const facets = getFacets();
  const cards = listCatalogue({
    brand: [resolved],
    category: toArray(query.category),
    gender: toArray(query.gender),
    condition: toArray(query.condition),
    inStockOnly: query.stock === "1",
    sort: query.sort as never,
  });

  const totalUnits = cards.reduce(
    (n, c) => n + c.colourways.reduce((m, cw) => m + cw.total_quantity, 0),
    0,
  );

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-6">
        <p className="label-caps">Brand</p>
        <h1 className="mt-2 text-3xl display-xl">{resolved}</h1>
        <p className="mt-2 tabular text-sm text-graphite-ink">
          {cards.length} {cards.length === 1 ? "style" : "styles"} ·{" "}
          {totalUnits.toLocaleString("en-AE")} units in stock
        </p>
      </div>

      <FilterBar
        facets={facets}
        resultCount={cards.length}
        lockedFilter={{ key: "brand", value: resolved }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {cards.length === 0 ? (
          <EmptyState
            title={`Nothing from ${resolved} matches those filters.`}
            action={{
              href: `/brand/${encodeURIComponent(resolved.toLowerCase())}`,
              label: `Show all ${resolved}`,
            }}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {cards.map((card, i) => (
              <li key={card.style_group ?? card.article_number}>
                <ProductCard card={card} priority={i < 4} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
