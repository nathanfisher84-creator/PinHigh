import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getColourwayRuns,
  getProductByArticle,
  getStockAsAt,
  listCatalogue,
} from "@/lib/repo/catalogue";
import { ColourwayPanel } from "@/components/order/ColourwayPanel";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { StockAlertForm } from "@/components/catalogue/StockAlertForm";
import {
  CATEGORY_LABELS,
  GENDER_LABELS,
  CONDITION_LABELS,
} from "@/lib/domain/types";
import { amount, money, PRICE_CAVEAT, stockAsAt } from "@/lib/format";

type Params = Promise<{ article_number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { article_number } = await params;
  const product = getProductByArticle(decodeURIComponent(article_number));
  if (!product) return { title: "Product not found" };

  return {
    title: `${product.brand} ${product.style_name} — ${product.colour}`,
    description:
      product.description ??
      `${product.brand} ${product.style_name} in ${product.colour}. Corporate quantities quoted from stock in Dubai, with optional logo branding.`,
    alternates: { canonical: `/product/${encodeURIComponent(product.article_number)}` },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { article_number } = await params;
  const product = getProductByArticle(decodeURIComponent(article_number));
  if (!product) notFound();

  const runs = getColourwayRuns(product);
  const stockDate = getStockAsAt();
  const totalUnits = product.variants.reduce((n, v) => n + v.quantity, 0);

  // Related: same category and brand, excluding this style group.
  const related = listCatalogue({ category: [product.category], brand: [product.brand] })
    .filter((c) =>
      product.style_group
        ? c.style_group !== product.style_group
        : c.article_number !== product.article_number,
    )
    .slice(0, 4);

  /* Product structured data — this is a discovery channel for new trade
     accounts (§11 SEO). Offers are marked as the indicative figures they are,
     with availability reflecting real stock rather than an optimistic default. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${product.brand} ${product.style_name}`,
    sku: product.article_number,
    color: product.colour,
    brand: { "@type": "Brand", name: product.brand },
    description: product.description ?? `${product.style_name} in ${product.colour}.`,
    category: CATEGORY_LABELS[product.category],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "AED",
      lowPrice: product.price_wholesale ?? undefined,
      highPrice: product.rrp ?? product.price_wholesale ?? undefined,
      offerCount: product.variants.length,
      availability:
        totalUnits > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition:
        product.condition === "new"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 pb-32 lg:pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-graphite-ink">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/catalogue" className="hover:text-fairway">
              Catalogue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/catalogue/${product.category}`}
              className="hover:text-fairway"
            >
              {CATEGORY_LABELS[product.category]}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {product.style_name}
          </li>
        </ol>
      </nav>

      <ColourwayPanel
        runs={runs}
        initialArticle={product.article_number}
        brand={product.brand}
        styleName={product.style_name}
      />

      {/* Price block. Every figure carries the caveat (§6.2, §7.1). */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="hairline bg-paper-raised px-4 py-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="tabular text-xl">
                <strong className="font-bold">{money(product.price_wholesale)}</strong>
                <span className="text-graphite-ink text-sm"> per unit</span>
              </p>
              {product.rrp !== null && (
                <p className="tabular text-sm text-graphite-ink">
                  RRP {amount(product.rrp)}
                  {product.price_wholesale !== null && product.rrp > 0 && (
                    <span>
                      {" "}
                      · {Math.round((1 - product.price_wholesale / product.rrp) * 100)}% below
                      retail
                    </span>
                  )}
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-graphite-ink">{PRICE_CAVEAT}</p>
            <p className="mt-2 tabular text-xs text-graphite-ink">{stockAsAt(stockDate)}</p>
          </div>

          {totalUnits === 0 && (
            <div className="mt-4">
              {/* A style whose sizes all hit 0 stays visible, marked out of
                  stock, with an email capture (§4.3). */}
              <StockAlertForm articleNumber={product.article_number} />
            </div>
          )}
        </div>

        <dl className="text-sm">
          <div className="flex justify-between gap-4 border-b border-sand py-2">
            <dt className="text-graphite-ink">Article number</dt>
            <dd className="tabular">{product.article_number}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-sand py-2">
            <dt className="text-graphite-ink">Brand</dt>
            <dd>{product.brand}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-sand py-2">
            <dt className="text-graphite-ink">Category</dt>
            <dd>{CATEGORY_LABELS[product.category]}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-sand py-2">
            <dt className="text-graphite-ink">Fit</dt>
            <dd>{GENDER_LABELS[product.gender]}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-sand py-2">
            <dt className="text-graphite-ink">Condition</dt>
            <dd
              className={product.condition === "new" ? "" : "text-flag-ink font-medium"}
            >
              {CONDITION_LABELS[product.condition]}
            </dd>
          </div>
          {product.fabric && (
            <div className="flex justify-between gap-4 border-b border-sand py-2">
              <dt className="text-graphite-ink">Fabric</dt>
              <dd className="text-right">{product.fabric}</dd>
            </div>
          )}
          {product.season && (
            <div className="flex justify-between gap-4 border-b border-sand py-2">
              <dt className="text-graphite-ink">Season</dt>
              <dd className="tabular">{product.season}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 border-b border-sand py-2">
            <dt className="text-graphite-ink">Total in stock</dt>
            <dd className="tabular">{totalUnits}</dd>
          </div>
        </dl>
      </div>

      {product.description && (
        <div className="mt-8 max-w-2xl">
          <h2 className="label-caps mb-2">Description</h2>
          <p className="text-sm leading-relaxed">{product.description}</p>
        </div>
      )}

      <div className="mt-10 hairline bg-paper-raised px-4 py-4 max-w-2xl">
        <h2 className="label-caps mb-2">Adding your logo</h2>
        <p className="text-sm text-graphite-ink">
          You can add your logo to this item when you review your order. Branding
          is quoted separately — cost depends on the artwork, the placement and
          the quantity, so our team prices it with the rest of the request.
        </p>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl mb-6">More {product.brand}</h2>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
            {related.map((card) => (
              <li key={card.style_group ?? card.article_number}>
                <ProductCard card={card} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
