"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColourwayRun } from "@/lib/repo/catalogue";
import { SizeGrid } from "./SizeGrid";
import { ProductImage } from "@/components/catalogue/ProductImage";
import { ConditionTag } from "@/components/catalogue/ConditionTag";
import { useCart } from "@/lib/cart/store";
import { units } from "@/lib/format";

/**
 * The colour switcher and the grid it drives (spec §6.3).
 *
 * The rule this component exists to guarantee: "Quantities entered against
 * other colourways stay in the basket and remain visible in a running summary
 * — buyers routinely take the same style in three colours and must never lose
 * a size run by clicking a swatch."
 *
 * So switching colour is local state over data that is already loaded, the
 * basket is keyed by SKU and never scoped to the visible colourway, and the
 * other colours a buyer has already specified are summarised directly beneath
 * the grid where they cannot be missed.
 */

interface Props {
  runs: ColourwayRun[];
  initialArticle: string;
  brand: string;
  styleName: string;
}

export function ColourwayPanel({ runs, initialArticle, brand, styleName }: Props) {
  const router = useRouter();
  const cart = useCart();

  const initialIndex = Math.max(
    0,
    runs.findIndex((r) => r.article_number === initialArticle),
  );
  const [index, setIndex] = useState(initialIndex);
  const active = runs[index] ?? runs[0];

  /** Units the buyer has entered against each colourway, live. */
  const perColourway = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart.lines) {
      map.set(line.article_number, (map.get(line.article_number) ?? 0) + line.quantity);
    }
    return map;
  }, [cart.lines]);

  const otherColoursInBasket = runs
    .filter((r) => r.article_number !== active.article_number)
    .map((r) => ({ run: r, qty: perColourway.get(r.article_number) ?? 0 }))
    .filter((r) => r.qty > 0);

  const switchTo = (i: number) => {
    setIndex(i);
    // Keep the URL on the article being specified, so a shared link and a
    // browser refresh both land on the colour the buyer was looking at.
    // replace, not push — the back button should leave the product, not walk
    // back through every swatch.
    router.replace(`/product/${encodeURIComponent(runs[i].article_number)}`, {
      scroll: false,
    });
  };

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-[4/5] bg-paper-sunken hairline">
          <ProductImage
            src={active.image}
            alt={`${styleName} in ${active.colour}`}
            articleNumber={active.article_number}
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
          {active.condition !== "new" && (
            <span className="absolute right-0 top-0">
              <ConditionTag condition={active.condition} size="md" />
            </span>
          )}
        </div>

        <div>
          {/* Rendered as the brand writes it — adidas is lowercase by design. */}
          <p className="text-xs font-semibold tracking-wider text-graphite-ink">
            {brand}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl display-xl">{styleName}</h1>

          <p className="mt-2 text-graphite-ink">
            {active.colour}
            <span className="tabular"> · Art. {active.article_number}</span>
          </p>

          {runs.length > 1 && (
            <div className="mt-5">
              <p className="label-caps mb-2">
                Colour — {runs.length} available
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a colour">
                {runs.map((r, i) => {
                  const inBasket = perColourway.get(r.article_number) ?? 0;
                  return (
                    <button
                      key={r.article_number}
                      type="button"
                      onClick={() => switchTo(i)}
                      aria-pressed={i === index}
                      className={[
                        "relative flex items-center gap-2 border px-2 py-1.5 text-xs transition-colors duration-150",
                        i === index
                          ? "border-ink bg-paper-raised"
                          : "border-sand hover:border-graphite",
                      ].join(" ")}
                    >
                      <span
                        className="block h-4 w-4 border border-sand"
                        style={{
                          backgroundColor: r.colour_hex ?? "var(--color-paper-sunken)",
                        }}
                        aria-hidden="true"
                      />
                      <span>{r.colour}</span>
                      {inBasket > 0 && (
                        <span className="tabular font-bold text-fairway">{inBasket}</span>
                      )}
                      {r.total_quantity === 0 && (
                        <span className="text-graphite">· out</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <SizeGrid
            key={active.article_number}
            article_number={active.article_number}
            brand={brand}
            style_name={styleName}
            colour={active.colour}
            category={active.category}
            variants={active.variants}
            case_pack={active.case_pack}
            moq={active.moq}
          />

          {/* The running summary that makes switching safe. */}
          {otherColoursInBasket.length > 0 && (
            <div className="mt-6 hairline bg-fairway-wash px-4 py-3">
              <p className="label-caps mb-2">Also on your order for this style</p>
              <ul className="space-y-1">
                {otherColoursInBasket.map(({ run, qty }) => (
                  <li key={run.article_number} className="flex items-baseline justify-between gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => switchTo(runs.indexOf(run))}
                      className="text-left underline underline-offset-2 hover:text-fairway"
                    >
                      {run.colour}
                    </button>
                    <span className="tabular shrink-0">{units(qty)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
