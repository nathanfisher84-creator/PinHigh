import Link from "next/link";
import {
  getCategoryCounts,
  getStockAsAt,
  listCatalogue,
} from "@/lib/repo/catalogue";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { getCatalogueTotals } from "@/lib/repo/catalogue";

/**
 * Landing page.
 *
 * Positioning per §14.6: the old "THE UAE'S BEST VALUE GOLF GEAR" is a
 * discount-retail promise that undermines a corporate proposition, so the hero
 * states who this serves and what it does for them.
 *
 * The design leans properly into the yardage-book idea (§10) rather than
 * gesturing at it. A yardage book is a dense, gridded, numeric document, so
 * the page is built from type and real figures instead of a row of bordered
 * feature cards — the stock position *is* the most persuasive thing Pin High
 * has, and it belongs at full size rather than in a badge.
 */

const FEATURED: Category[] = [
  "polos",
  "mid-layers",
  "outerwear",
  "shoes",
  "caps",
  "golf-bags",
  "balls",
  "accessories",
];

export default async function HomePage() {
  const counts = await getCategoryCounts();
  const stockDate = await getStockAsAt();
  const totals = await getCatalogueTotals();
  const featured = (await listCatalogue({ inStockOnly: true, sort: "stock" })).slice(0, 4);
  const liveCategories = FEATURED.filter(async (c) => (counts.get(c) ?? 0) > 0);

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="on-fairway">
        <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
          <div className="pt-20 pb-16 sm:pt-28 sm:pb-20 lg:pt-36 lg:pb-24">
            <p className="label-caps text-on-fairway-dim">
              Corporate golf supply — Dubai
            </p>

            <h1 className="mt-8 display display-tight text-5xl sm:text-6xl lg:text-7xl max-w-[15ch]">
              Kit the whole day out of one warehouse.
            </h1>

            <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
              <p className="measure text-lg text-on-fairway-dim">
                Pin High supplies UAE companies with adidas golf apparel and
                equipment — tournaments, client gifting, staff kit — held in stock
                in Dubai and branded with your logo if you want it. Build the size
                run you need and our team quotes it.
              </p>

              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Link
                  href="/catalogue"
                  className="bg-fairway-bright px-7 py-4 text-fairway-deep font-semibold hover:bg-on-fairway transition-colors duration-150"
                >
                  Browse the catalogue
                </Link>
                <Link
                  href="/contact"
                  className="border border-fairway-line px-7 py-4 hover:border-on-fairway transition-colors duration-150"
                >
                  Talk to the team
                </Link>
              </div>
            </div>
          </div>

          {/* The stock position, at full size. This is a distributor — the
              numbers are the proposition, not a footnote. */}
          <dl className="grid grid-cols-2 gap-y-10 border-t border-fairway-line py-12 lg:grid-cols-4">
            <Figure
              value={totals.units.toLocaleString("en-AE")}
              label="Units on the shelf"
            />
            <Figure value={String(totals.articles)} label="Articles" />
            <Figure value={String(totals.sizes)} label="Size options" />
            <Figure
              value={stockDate ? (await formatDate(stockDate)) : "—"}
              label="Stock counted"
              small
            />
          </dl>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 py-20 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-20">
          <div>
            <h2 className="display text-3xl lg:text-4xl">
              We quote it.
              <br />
              Nothing is sold here.
            </h2>
            <p className="mt-5 text-graphite-ink">
              Corporate orders change once they are talked through, so there is no
              checkout. You specify, we price it properly — quantity, branding and
              delivery together.
            </p>
          </div>

          <ol className="grid gap-px bg-sand sm:grid-cols-3">
            {[
              {
                n: "01",
                title: "Build a size run",
                body: "Enter quantities against the sizes you need. Availability is shown per size, from our own stock.",
              },
              {
                n: "02",
                title: "Add your logo",
                body: "Choose placements per item and upload your artwork. Optional, and quoted separately.",
              },
              {
                n: "03",
                title: "We come back with a price",
                body: "Including branding and delivery, usually within a day. Nothing is charged online.",
              },
            ].map((step) => (
              <li key={step.n} className="bg-paper pt-8 sm:px-7 sm:pt-10 pb-2">
                <p className="figure-xl text-4xl text-sand">{step.n}</p>
                <h3 className="mt-6 text-xl">{step.title}</h3>
                <p className="mt-2 text-sm text-graphite-ink">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Stock ───────────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 pb-20 lg:pb-28">
          <div className="flex flex-wrap items-baseline justify-between gap-4 rule-strong pt-6">
            <h2 className="display text-3xl lg:text-4xl">Best stocked</h2>
            <Link
              href="/catalogue?sort=stock"
              className="link-underline hover:link-underline-on text-sm"
            >
              All {totals.articles} articles
            </Link>
          </div>

          <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-16 lg:grid-cols-4 lg:gap-x-10">
            {featured.map((card, i) => (
              <li key={card.style_group ?? card.article_number}>
                <ProductCard card={card} priority={i < 4} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Categories ──────────────────────────────────────────────────── */}
      {liveCategories.length > 0 && (
        <section className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 pb-20 lg:pb-28">
          <h2 className="display text-3xl lg:text-4xl rule-strong pt-6">
            By category
          </h2>
          <ul className="mt-8">
            {liveCategories.map((c) => (
              <li key={c}>
                <Link
                  href={`/catalogue/${c}`}
                  className="group flex items-baseline justify-between gap-6 border-b border-sand py-5 transition-colors duration-150 hover:border-ink"
                >
                  <span className="display text-2xl lg:text-3xl group-hover:text-fairway transition-colors duration-150">
                    {CATEGORY_LABELS[c]}
                  </span>
                  <span className="tabular text-sm text-graphite-ink">
                    {counts.get(c)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Who this is for (§14.5: stray consumer visitors) ─────────────── */}
      <section className="border-t border-sand">
        <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 py-16 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:gap-20">
            <h2 className="display text-2xl lg:text-3xl">Buying for yourself?</h2>
            <div className="measure">
              <p className="text-graphite-ink">
                Pin High supplies companies rather than individual golfers, so
                there is no checkout here and we quote by the size run. If you
                need one or two pieces, get in touch and we will point you at a
                retailer — and if you organise your company&apos;s golf day, we
                would be glad to help with that.
              </p>
              <Link
                href="/contact"
                className="mt-5 inline-block link-underline link-underline-on hover:text-fairway"
              >
                Contact the team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Figure({
  value,
  label,
  small,
}: {
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <div>
      <dt className="label-caps text-on-fairway-dim order-2">{label}</dt>
      <dd
        className={[
          "figure-xl mt-3 text-fairway-bright",
          small ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
