import Link from "next/link";
import {
  getCategoryCounts,
  getStockAsAt,
  listCatalogue,
} from "@/lib/repo/catalogue";
import { getCatalogueTotals } from "@/lib/repo/catalogue";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";

/**
 * Landing page — the B-Line architecture.
 *
 * The reference (styles.refero.design, "B-Line"): a technical catalogue that
 * treats the site itself as an index. A dense intro paragraph at the very
 * top, the wordmark at full viewport width as the hero, navigation set in
 * monospace like a parts list, then one continuous edge-to-edge grid of
 * product photography on a uniform studio ground. No decorative sections, no
 * shadows, nothing centered in a polite container.
 *
 * Adaptation, deliberate: the reference is strictly achromatic; Pin High's
 * navy stands in for its black, and the logo green survives only where the
 * brand or an action lives. Everything else is ink, graphite and paper.
 */

const CATEGORY_ORDER: Category[] = [
  "polos",
  "t-shirts",
  "mid-layers",
  "outerwear",
  "caps",
  "shoes",
  "golf-bags",
  "balls",
  "accessories",
];

export default async function HomePage() {
  const counts = await getCategoryCounts();
  const stockDate = await getStockAsAt();
  const totals = await getCatalogueTotals();
  const cards = await listCatalogue({ sort: "stock" });
  const liveCategories = CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0);

  return (
    <>
      {/* ── Dense intro — the reference opens with the whole pitch in small
             bold type, edge to edge, before anything visual. ──────────── */}
      <section className="border-b border-ink px-2 pt-3 pb-4 sm:px-3">
        <p className="max-w-none text-xs font-semibold leading-snug sm:text-sm sm:leading-snug lg:columns-2 lg:gap-8">
          Pin High supplies UAE companies with adidas golf apparel and equipment
          — tournaments, client gifting, staff kit — held in stock in Dubai and
          embroidered with your logo where you want it. This site is a catalogue
          and a quote tool, not a shop: you build the size run you need and our
          team prices it properly — quantity, branding and delivery together.
          Nothing is charged online and nothing is reserved until we confirm it,
          because corporate orders always change once they are talked through.
          Availability below is our own warehouse position, counted{" "}
          {stockDate ? formatDate(stockDate) : "daily"}.
        </p>
      </section>

      {/* ── The wordmark IS the hero: full viewport width, edge to edge. ── */}
      <section className="px-2 pt-6 sm:px-3" aria-label="Pin High">
        <svg
          viewBox="0 0 720 104"
          className="h-auto w-full"
          role="img"
          aria-label="PINHIGH"
          xmlns="http://www.w3.org/2000/svg"
        >
          <text
            x="0"
            y="88"
            textLength="720"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="var(--font-display), sans-serif"
            fontWeight="800"
            fontSize="104"
            letterSpacing="-4"
          >
            <tspan fill="#5CB947">PIN</tspan>
            <tspan fill="var(--color-ink)">HIGH</tspan>
          </text>
        </svg>

        {/* The index row: navigation as a parts list. */}
        <nav
          aria-label="Catalogue index"
          className="mono-ui mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-3 border-t border-ink pt-3 pb-1"
        >
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="text-graphite-ink">Catalogue:</span>
            <Link href="/catalogue" className="boxed hover:text-fairway">
              All
            </Link>
            {liveCategories.map((c) => (
              <Link key={c} href={`/catalogue/${c}`} className="hover:text-fairway">
                {CATEGORY_LABELS[c]}
              </Link>
            ))}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-4">
            <span className="text-graphite-ink">Fit:</span>
            <Link href="/catalogue?gender=mens" className="hover:text-fairway">
              Men
            </Link>
            <Link href="/catalogue?gender=ladies" className="hover:text-fairway">
              Women
            </Link>
          </span>
          <span className="flex flex-wrap items-baseline gap-x-4">
            <Link href="/about" className="hover:text-fairway">
              About
            </Link>
            <Link href="/contact" className="hover:text-fairway">
              Contact
            </Link>
          </span>
          <span className="tabular ml-auto text-graphite-ink">
            {totals.units.toLocaleString("en-AE")} units · {totals.articles}{" "}
            articles · {totals.sizes} sizes
          </span>
        </nav>
      </section>

      {/* ── One continuous grid. Every article, edge to edge. ───────────── */}
      <section aria-label="The catalogue" className="px-2 pb-10 pt-6 sm:px-3">
        <ul className="grid grid-cols-2 gap-x-2 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
          {cards.map((card, i) => (
            <li key={card.style_group ?? card.article_number}>
              <ProductCard card={card} priority={i < 4} />
            </li>
          ))}
        </ul>
      </section>

      {/* ── How buying works, as three mono index entries. ──────────────── */}
      <section className="border-t border-ink px-2 py-6 sm:px-3">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
          {[
            {
              n: "01",
              title: "Build a size run",
              body: "Enter quantities against the sizes you need. Availability is shown per size, from our own stock.",
            },
            {
              n: "02",
              title: "Add your logo",
              body: "Try it on any product right on the page, choose placements, upload your artwork with the request.",
            },
            {
              n: "03",
              title: "We come back with a price",
              body: "Quantity, branding and delivery quoted together, usually within a day. Nothing is charged online.",
            },
          ].map((step) => (
            <div key={step.n} className="mono-ui">
              <p>
                <span className="text-graphite-ink">{step.n}</span>{" "}
                <span className="font-bold">{step.title}</span>
              </p>
              <p className="mt-1 text-graphite-ink">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who this is for (§14.5: stray consumer visitors). ───────────── */}
      <section className="border-t border-sand px-2 py-6 sm:px-3">
        <p className="mono-ui max-w-3xl text-graphite-ink">
          <span className="font-bold text-ink">Buying for yourself?</span> Pin
          High supplies companies rather than individual golfers — there is no
          checkout here and we quote by the size run. Need one or two pieces?{" "}
          <Link href="/contact" className="underline underline-offset-2 hover:text-fairway">
            Get in touch
          </Link>{" "}
          and we will point you at a retailer.
        </p>
      </section>
    </>
  );
}
