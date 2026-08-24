import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getColourwayRuns,
  getProductByArticle,
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
import { PRICE_NOTE, PRICE_ON_REQUEST, RETAIL_RRP_LABEL, RETAIL_RRP_NOTE, money } from "@/lib/format";
import { isRelatedCatalogueCard } from "@/lib/domain/buyer-predicates";
import { hasOfficialCopy, officialCopy, splitCopyLines } from "@/lib/domain/adidas-copy";

type Params = Promise<{ article_number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { article_number } = await params;
  const product = await getProductByArticle(decodeURIComponent(article_number));
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
  const product = await getProductByArticle(decodeURIComponent(article_number));
  if (!product) notFound();

  const runs = (await getColourwayRuns(product));
  const totalUnits = product.variants.reduce((n, v) => n + v.quantity, 0);
  const official = officialCopy(product.article_number);
  const material = official.material ?? product.fabric;
  const features = official.features.length ? official.features : splitCopyLines(product.features);
  const benefits = official.benefits.length ? official.benefits : splitCopyLines(product.benefits);
  const description = official.description ?? product.description;
  const hasDetails =
    Boolean(material) ||
    features.length > 0 ||
    benefits.length > 0 ||
    Boolean(description) ||
    hasOfficialCopy(official);

  // Related: same category and brand, excluding this style group.
  const related = (await listCatalogue({ category: [product.category], brand: [product.brand] }))
    .filter((c) => isRelatedCatalogueCard(c, product))
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
      // No price is published: corporate pricing depends on quantity, branding
      // and delivery, so there is no figure that would be true for every buyer.
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
    <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 py-10 pb-32 lg:pb-24">
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
            <p className="label-caps">{RETAIL_RRP_LABEL}</p>
            <p className="mt-1 text-lg font-medium tabular">
              {product.rrp != null ? money(product.rrp) : "On request"}
            </p>
            <p className="mt-1 text-sm text-graphite-ink">{RETAIL_RRP_NOTE}</p>
            <p className="mt-4 text-lg font-medium">{PRICE_ON_REQUEST}</p>
            <p className="mt-1 text-sm text-graphite-ink">{PRICE_NOTE}</p>
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
          {material && (
            <div className="flex justify-between gap-4 border-b border-sand py-2">
              <dt className="text-graphite-ink">Material</dt>
              <dd className="text-right">{material}</dd>
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

      {hasDetails ? (
        <div className="mt-8 max-w-2xl space-y-6">
          {description && (
            <div>
              <h2 className="label-caps mb-2">Description</h2>
              <p className="text-sm leading-relaxed">{description}</p>
            </div>
          )}
          {features.length > 0 && (
            <div>
              <h2 className="label-caps mb-2">Features</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {benefits.length > 0 && (
            <div>
              <h2 className="label-caps mb-2">Benefits</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {benefits.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 max-w-2xl">
          <h2 className="label-caps mb-2">Product information</h2>
          <p className="text-sm text-graphite-ink">Details on request.</p>
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
