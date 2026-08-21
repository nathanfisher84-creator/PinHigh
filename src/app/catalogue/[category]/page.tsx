import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCatalogue, getFacets } from "@/lib/repo/catalogue";
import { FilterBar } from "@/components/catalogue/FilterBar";
import { BrowseBar } from "@/components/catalogue/BrowseBar";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/domain/types";

type Params = Promise<{ category: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params;
  if (!CATEGORIES.includes(category as Category)) return { title: "Not found" };
  const label = CATEGORY_LABELS[category as Category];
  return {
    title: label,
    description: `${label} for UAE corporate golf days, tournaments and staff kit. Quoted from stock in Dubai.`,
    alternates: { canonical: `/catalogue/${category}` },
  };
}

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { category } = await params;
  if (!CATEGORIES.includes(category as Category)) notFound();

  const query = await searchParams;
  const label = CATEGORY_LABELS[category as Category];

  const facets = getFacets();
  const cards = listCatalogue({
    category: [category],
    brand: toArray(query.brand),
    gender: toArray(query.gender),
    condition: toArray(query.condition),
    inStockOnly: query.stock === "1",
    sort: query.sort as never,
  });

  return (
    <>
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 pt-14 pb-8">
        <h1 className="display text-4xl lg:text-6xl">{label}</h1>
        <p className="mt-2 max-w-2xl text-graphite-ink">
          Enter quantities against the sizes you need and send it to our team as
          a quote request.
        </p>
      </div>

      <BrowseBar categories={facets.categories} genders={facets.genders} />

      <FilterBar
        facets={facets}
        resultCount={cards.length}
        lockedFilter={{ key: "category", value: category }}
      />

      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 py-12">
        {cards.length === 0 ? (
          <EmptyState
            title={`No ${label.toLowerCase()} match those filters.`}
            body="Clear a filter or two and the list will fill back up."
            action={{ href: `/catalogue/${category}`, label: `Show all ${label.toLowerCase()}` }}
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
