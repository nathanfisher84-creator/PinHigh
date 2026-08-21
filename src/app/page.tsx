import Link from "next/link";
import {
  getCategoryCounts,
  getStockAsAt,
  listBrands,
  listCatalogue,
} from "@/lib/repo/catalogue";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import { stockAsAt } from "@/lib/format";

/**
 * Landing page (spec §6.1).
 *
 * Positioning per §14.6: the old "THE UAE'S BEST VALUE GOLF GEAR" line is a
 * discount-retail promise that actively undermines a corporate proposition, so
 * the hero states who the site serves and what it does for them instead.
 *
 * §14.5 also applies here — stray consumer visitors will keep arriving from
 * the old Shopify rankings. One clear line tells them who this is for without
 * making them feel they have come somewhere they shouldn't.
 */

const FEATURED_CATEGORIES: Category[] = [
  "polos",
  "mid-layers",
  "outerwear",
  "shoes",
  "caps",
  "golf-bags",
  "balls",
  "accessories",
];

export default function HomePage() {
  const brands = listBrands();
  const counts = getCategoryCounts();
  const stockDate = getStockAsAt();
  const newIn = listCatalogue({ inStockOnly: true, sort: "stock" }).slice(0, 4);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-sand">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <p className="label-caps">Corporate golf supply · Dubai</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl display-xl leading-[1.05]">
            Kit your golf day out of stock we hold in Dubai.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-graphite-ink">
            Pin High supplies UAE companies with golf apparel, footwear and
            equipment across adidas, Callaway, Titleist, Ping, FootJoy and more —
            for tournaments, client gifting and staff kit, with your logo if you
            want it. Browse live availability, build a size run, and our team
            quotes it.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/catalogue"
              className="bg-fairway px-6 py-3 text-paper hover:bg-ink transition-colors duration-150"
            >
              Browse the catalogue
            </Link>
            <Link
              href="/contact"
              className="hairline px-6 py-3 hover:border-fairway transition-colors duration-150"
            >
              Talk to the team
            </Link>
          </div>

          <p className="mt-8 tabular text-xs text-graphite-ink">
            {stockAsAt(stockDate)} · Prices indicative, excl. VAT · Nothing is
            charged online
          </p>
        </div>
      </section>

      {/* How it works. The site is a quote platform, and saying so early is
          what stops a buyer treating it as a shop (§7.1). */}
      <section className="border-b border-sand bg-paper-raised">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <h2 className="label-caps mb-6">How this works</h2>
          <ol className="grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                title: "Build a size run",
                body: "Enter quantities against the sizes you need. Availability is shown per size, from our own stock.",
              },
              {
                n: "02",
                title: "Add your logo, if you want it",
                body: "Choose placements per item and upload your artwork. Branding is quoted separately.",
              },
              {
                n: "03",
                title: "We quote it",
                body: "Our team prices the request including branding and delivery, and comes back to you. Nothing is charged online.",
              },
            ].map((step) => (
              <li key={step.n}>
                <p className="tabular text-2xl text-fairway">{step.n}</p>
                <h3 className="mt-2 text-lg">{step.title}</h3>
                <p className="mt-1 text-sm text-graphite-ink">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Brands. §6.2: brand is how trade buyers navigate. */}
      <section className="border-b border-sand">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-baseline justify-between gap-4 mb-6">
            <h2 className="text-xl">Brands we stock</h2>
            <Link href="/brands" className="text-sm text-graphite-ink hover:text-fairway">
              All brands
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-px bg-sand sm:grid-cols-3 lg:grid-cols-5">
            {brands.map((b) => (
              <li key={b.value}>
                <Link
                  href={`/brand/${encodeURIComponent(b.value.toLowerCase())}`}
                  className="flex items-baseline justify-between gap-2 bg-paper px-4 py-4 hover:bg-fairway-wash transition-colors duration-150"
                >
                  <span className="font-medium">{b.label}</span>
                  <span className="tabular text-xs text-graphite-ink">{b.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Categories */}
      <section className="border-b border-sand">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <h2 className="text-xl mb-6">By category</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {FEATURED_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => (
              <li key={c}>
                <Link
                  href={`/catalogue/${c}`}
                  className="block hairline bg-paper-raised px-4 py-6 hover:border-fairway transition-colors duration-150"
                >
                  <span className="block font-medium">{CATEGORY_LABELS[c]}</span>
                  <span className="tabular mt-1 block text-xs text-graphite-ink">
                    {counts.get(c)} {counts.get(c) === 1 ? "style" : "styles"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Deepest stock — a corporate buyer needs a run they can actually fill. */}
      {newIn.length > 0 && (
        <section className="border-b border-sand">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h2 className="text-xl">Best stocked right now</h2>
              <Link href="/catalogue?sort=stock" className="text-sm text-graphite-ink hover:text-fairway">
                See all
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
              {newIn.map((card) => (
                <li key={card.style_group ?? card.article_number}>
                  <ProductCard card={card} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* §14.5: stray consumer visitors from the old rankings. Don't 404 them
          and don't make them feel unwelcome — some of them work for companies
          that run golf days. */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="hairline bg-paper-raised px-6 py-6 max-w-3xl">
            <h2 className="text-lg">Looking for a single item?</h2>
            <p className="mt-2 text-sm text-graphite-ink">
              Pin High supplies companies rather than individual golfers, so
              there&apos;s no checkout here and we quote by the size run. If you
              need one or two pieces, get in touch and we&apos;ll point you to a
              retailer — and if you organise your company&apos;s golf day, we can
              help with that too.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-block text-sm text-fairway underline underline-offset-4"
            >
              Contact the team
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
