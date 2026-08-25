import Link from "next/link";
import Image from "next/image";
import {
  getCategoryCounts,
  getProductByArticle,
  listCatalogue,
} from "@/lib/repo/catalogue";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import { getSetting } from "@/lib/db";
import { HeroBackground } from "@/components/home/HeroBackground";

/**
 * Landing page — premium retail anatomy, B2B content.
 *
 * The reference (a MOVE Activewear concept the owner supplied): full-bleed
 * photographic hero with one accent word, a trust bar, category tiles, a
 * best-sellers row, twin promo panels, and a dark feature strip. That anatomy
 * is kept beat for beat; every retail message is swapped for its trade
 * equivalent — shipping promos become supply facts, price tags become
 * "price on request", "join the community" becomes the logo try-on.
 *
 * Brand palette unchanged: navy stands where the reference uses black,
 * the logo green is the single accent, red stays operational.
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

/** Small stroke icons, drawn inline — never emoji (§10). */
function Icon({ d }: { d: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  warehouse: "M3 21V9l9-5 9 5v12M7 21v-6h10v6M10 21v-3h4v3",
  needle: "M4 20c8-1 13-6 16-16M14 8l2 2M10 13l2 2M17 4l3 3",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM12 7v5l3 3",
  shield: "M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3ZM9 12h6",
};

export default async function HomePage() {
  const counts = await getCategoryCounts();
  const cards = await listCatalogue({ sort: "stock" });
  const bestStocked = cards.filter((c) => c.total_quantity > 0).slice(0, 6);
  const liveCategories = CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).slice(0, 6);

  const kicker = (await getSetting("home_kicker")) || "Genuine adidas golf, supplied from Dubai";
  const headline = (await getSetting("home_headline")) || "The whole golf day.\nOne warehouse.";
  const body =
    (await getSetting("home_body")) ||
    "Tournaments, client gifting, staff kit — specified by the size run, embroidered with your logo, priced as one clear quote.";
  const ctaLabel = (await getSetting("home_cta_label")) || "Browse the catalogue";
  const ctaHref = (await getSetting("home_cta_href")) || "/catalogue";
  const heroImagesRaw = (await getSetting("hero_images")) || "[]";
  const heroImages = (() => {
    try {
      const parsed = JSON.parse(heroImagesRaw);
      return Array.isArray(parsed)
        ? parsed.filter((u): u is string => typeof u === "string")
        : [];
    } catch {
      return [];
    }
  })();
  const heroRotate = (await getSetting("hero_rotate")) === "true";
  const carouselOn = (await getSetting("carousel_enabled")) === "true";
  const carouselTitle = (await getSetting("carousel_title")) || "New in";
  const carouselArticles = (await getSetting("carousel_articles"))
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const carouselCards = [];
  if (carouselOn && carouselArticles.length) {
    for (const article of carouselArticles) {
      const product = await getProductByArticle(article);
      if (!product) continue;
      const card = cards.find((c) =>
        c.colourways.some((cw) => cw.article_number === product.article_number),
      );
      if (card) carouselCards.push(card);
    }
  }

  /** A representative photograph per category tile. */
  const tileImage = (c: Category) =>
    cards.find((card) => card.category === c && card.image)?.image ?? null;

  const heroProduct = bestStocked[0];

  return (
    <>
      {/* ── Hero: full-bleed photography, one accent word. ───────────────── */}
      <section className="relative isolate min-h-[520px] lg:min-h-[620px] flex items-center overflow-hidden bg-fairway-deep text-on-fairway">
        <HeroBackground images={heroImages} rotate={heroRotate} />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-fairway-deep/85 via-fairway-deep/45 to-transparent"
        />
        <div className="relative mx-auto w-full max-w-[110rem] px-5 py-20 sm:px-8 lg:px-12">
          <p className="inline-flex items-center gap-3 border-2 border-fairway-bright/80 bg-fairway-deep/60 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-on-fairway backdrop-blur-sm sm:text-sm">
            <span aria-hidden className="h-2 w-2 bg-fairway-bright" />
            {kicker}
            <span aria-hidden className="h-2 w-2 bg-fairway-bright" />
          </p>
          <h1 className="mt-5 display max-w-[13ch] text-4xl uppercase sm:text-5xl lg:text-6xl">
            {headline.split("\n").map((line, i, arr) => (
              <span key={i}>
                {i === arr.length - 1 ? (
                  <span className="text-fairway-bright">{line}</span>
                ) : (
                  line
                )}
                {i < arr.length - 1 && " "}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-md text-lg text-on-fairway-dim">
            {body}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={ctaHref.startsWith("/") ? ctaHref : "/catalogue"}
              className="bg-fairway-bright px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.08em] text-fairway-deep hover:bg-on-fairway transition-colors duration-150"
            >
              {ctaLabel}
            </Link>
            <Link
              href="/contact"
              className="border border-on-fairway/60 px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.08em] hover:border-on-fairway hover:bg-on-fairway/10 transition-colors duration-150"
            >
              Talk to the team
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust bar: the reference promises shipping; we promise supply. ── */}
      <section className="border-b border-sand bg-paper-sunken">
        <ul className="mx-auto grid max-w-[110rem] grid-cols-2 gap-x-6 gap-y-5 px-5 py-6 sm:px-8 lg:grid-cols-4 lg:px-12">
          {[
            {
              icon: ICONS.warehouse,
              title: "Held in our warehouse",
              sub: "Quoted from stock we hold",
            },
            {
              icon: ICONS.needle,
              title: "Your logo, embroidered",
              sub: "Applied here and priced with the order",
            },
            {
              icon: ICONS.clock,
              title: "One clear quote",
              sub: "Quantity, branding and delivery together",
            },
            {
              icon: ICONS.shield,
              title: "No online payments",
              sub: "Nothing charged or reserved until confirmed",
            },
          ].map((item) => (
            <li key={item.title} className="flex items-start gap-3">
              <span className="mt-0.5 text-fairway">
                <Icon d={item.icon} />
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.08em]">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-xs text-graphite-ink">{item.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {carouselOn && carouselCards.length > 0 && (
        <section className="mx-auto max-w-[110rem] px-5 py-14 sm:px-8 lg:px-12">
          <h2 className="text-center text-sm font-semibold uppercase tracking-[0.14em]">
            {carouselTitle}
          </h2>
          <ul className="mt-8 flex gap-4 overflow-x-auto scroll-x pb-2">
            {carouselCards.map((card, i) => (
              <li
                key={card.style_group ?? card.article_number}
                className="w-44 shrink-0 sm:w-52"
              >
                <ProductCard card={card} priority={i < 4} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Category tiles. ─────────────────────────────────────────────── */}
      {liveCategories.length > 0 && (
        <section className="mx-auto max-w-[110rem] px-5 py-14 sm:px-8 lg:px-12">
          <h2 className="text-center text-sm font-semibold uppercase tracking-[0.14em]">
            Shop by category
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {liveCategories.map((c) => {
              const img = tileImage(c);
              return (
                <li key={c}>
                  <Link
                    href={`/catalogue/${c}`}
                    className="group relative block aspect-[3/4] overflow-hidden bg-paper-sunken"
                  >
                    {img && (
                      <Image
                        src={img}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 17vw"
                        className="object-cover transition-transform duration-[400ms] ease-[var(--ease-out-quiet)] group-hover:scale-[1.03] motion-reduce:transform-none"
                      />
                    )}
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-fairway-deep/85 to-transparent"
                    />
                    <span className="absolute inset-x-0 bottom-0 p-3 text-center">
                      <span className="block text-sm font-bold uppercase tracking-[0.08em] text-on-fairway">
                        {CATEGORY_LABELS[c]}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-on-fairway-dim group-hover:text-fairway-bright transition-colors duration-150">
                        Shop now
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Best stocked. ───────────────────────────────────────────────── */}
      {bestStocked.length > 0 && (
        <section className="mx-auto max-w-[110rem] px-5 pb-14 sm:px-8 lg:px-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Deepest in stock
            </h2>
            <Link
              href="/catalogue?sort=stock"
              className="text-xs font-semibold uppercase tracking-[0.08em] link-underline hover:link-underline-on"
            >
              View all →
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 xl:grid-cols-6">
            {bestStocked.map((card, i) => (
              <li key={card.style_group ?? card.article_number}>
                <ProductCard card={card} priority={i < 6} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Twin promo panels. ──────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[110rem] gap-4 px-5 pb-14 sm:px-8 lg:grid-cols-2 lg:px-12">
        <div className="relative isolate flex min-h-[300px] items-end overflow-hidden bg-fairway-deep p-8 text-on-fairway">
          <Image
            src="/hero/course.webp"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-bottom opacity-60"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-fairway-deep/90 via-fairway-deep/30 to-transparent"
          />
          <div className="relative">
            <h2 className="display text-2xl uppercase sm:text-3xl">
              Built for <span className="text-fairway-bright">tournaments.</span>
            </h2>
            <p className="mt-2 max-w-sm text-sm text-on-fairway-dim">
              Full size runs, one delivery, every player kitted the same. Prize
              tables and gifting handled from the same stock.
            </p>
            <Link
              href="/catalogue/polos"
              className="mt-5 inline-block bg-fairway-bright px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-fairway-deep hover:bg-on-fairway transition-colors duration-150"
            >
              Explore polos
            </Link>
          </div>
        </div>

        <div className="flex min-h-[300px] items-center gap-6 border border-sand bg-paper-raised p-8">
          {heroProduct?.image && (
            <div className="relative hidden aspect-[4/5] w-2/5 shrink-0 bg-paper-sunken sm:block">
              <Image
                src={heroProduct.image}
                alt={heroProduct.style_name}
                fill
                sizes="20vw"
                className="object-cover"
              />
            </div>
          )}
          <div>
            <h2 className="display text-2xl uppercase sm:text-3xl">
              See your logo <span className="text-fairway">on it.</span>
            </h2>
            <p className="mt-2 max-w-sm text-sm text-graphite-ink">
              Upload your logo on any product page, drag it where you want it,
              and try it across the whole catalogue before you ask for a price.
            </p>
            {heroProduct && (
              <Link
                href={`/product/${encodeURIComponent(heroProduct.article_number)}`}
                className="mt-5 inline-block border border-ink px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] hover:bg-ink hover:text-paper transition-colors duration-150"
              >
                Try it now
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── Feature strip. ──────────────────────────────────────────────── */}
      <section className="on-fairway">
        <ul className="mx-auto grid max-w-[110rem] grid-cols-2 gap-x-6 gap-y-4 px-5 py-6 sm:px-8 lg:grid-cols-4 lg:px-12">
          {[
            "Genuine adidas stock",
            "Full size runs XS–4XL",
            "Embroidery in Dubai",
            "Quoted in AED, excl. VAT",
          ].map((f) => (
            <li
              key={f}
              className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.08em]"
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-fairway-bright" />
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Who this is for (§14.5: stray consumer visitors). ───────────── */}
      <section className="mx-auto max-w-[110rem] px-5 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:gap-16">
          <h2 className="display text-xl uppercase sm:text-2xl">Buying for yourself?</h2>
          <p className="measure text-sm text-graphite-ink">
            Pin High supplies companies rather than individual golfers — there is
            no checkout here and we quote by the size run. If you need one or two
            pieces, visit{" "}
            <a
              href="https://pinhighuae.com"
              className="underline underline-offset-2 hover:text-fairway"
            >
              pinhighuae.com
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
