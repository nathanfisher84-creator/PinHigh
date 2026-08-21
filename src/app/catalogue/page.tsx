import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listCatalogue, getFacets, findExactArticle } from "@/lib/repo/catalogue";
import { FilterBar } from "@/components/catalogue/FilterBar";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Golf apparel, footwear, equipment and accessories from stock in Dubai. Build a size run and request a quote.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : undefined;

  // An exact article number jumps straight to the product (§6.2). Buyers paste
  // article numbers in constantly and expect to land on the item, not a list
  // of one.
  if (query) {
    const exact = findExactArticle(query);
    if (exact) redirect(`/product/${encodeURIComponent(exact)}`);
  }

  const facets = getFacets();
  const cards = listCatalogue({
    brand: toArray(params.brand),
    category: toArray(params.category),
    gender: toArray(params.gender),
    condition: toArray(params.condition),
    colour: toArray(params.colour),
    inStockOnly: params.stock === "1",
    search: query,
    sort: params.sort as never,
  });

  return (
    <>
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 pt-14 pb-8">
        <h1 className="display text-4xl lg:text-6xl">
          {query ? `Search: ${query}` : "Catalogue"}
        </h1>
        <p className="mt-2 max-w-2xl text-graphite-ink">
          Everything here is quoted, not sold online. Enter quantities against the
          sizes you need and send it to our team.
        </p>
      </div>

      <FilterBar facets={facets} resultCount={cards.length} />

      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 py-12">
        {cards.length === 0 ? (
          <EmptyState
            title={query ? "Nothing matched that search." : "Nothing matches those filters."}
            body={
              query
                ? "Try the style name, a colour, or paste an article number straight in."
                : "Clear a filter or two and the list will fill back up."
            }
            action={{ href: "/catalogue", label: "Show everything" }}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-16 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-10">
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
