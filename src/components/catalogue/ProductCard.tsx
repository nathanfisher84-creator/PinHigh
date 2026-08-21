"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogueCard } from "@/lib/repo/catalogue";
import type { Condition } from "@/lib/domain/types";
import { PRICE_ON_REQUEST } from "@/lib/format";
import { ProductImage } from "./ProductImage";
import { AvailabilityStrip } from "./AvailabilityStrip";
import { ConditionTag } from "./ConditionTag";

/**
 * A listing card (spec §6.2).
 *
 * No border and no panel. The photograph is the card; everything under it is
 * type on the page ground. Boxing each product in a hairline rectangle is what
 * made the first version of this listing read as a template — the grid already
 * separates them, so the box was doing nothing except adding noise.
 *
 * Where a style_group is set, sibling colourways collapse into one card and
 * the swatches switch the image and article number in place.
 */
export function ProductCard({ card, priority }: { card: CatalogueCard; priority?: boolean }) {
  const [active, setActive] = useState(0);
  const colourway = card.colourways[active] ?? card.colourways[0];
  const multi = card.colourways.length > 1;
  const showStrip = active === 0 && card.sizes.length > 0;
  const soldOut = colourway.total_quantity === 0;

  return (
    <article className="group">
      {/* The technical label sits above the frame, like a catalogue index. */}
      <p className="mono-ui mb-1 flex items-baseline justify-between gap-2">
        <Link
          href={`/product/${encodeURIComponent(colourway.article_number)}`}
          className="truncate hover:underline underline-offset-2"
        >
          {card.style_name}
        </Link>
        <span className="tabular shrink-0 text-graphite-ink">
          {colourway.article_number}
        </span>
      </p>

      <Link
        href={`/product/${encodeURIComponent(colourway.article_number)}`}
        className="block"
      >
        <div className="studio relative aspect-[4/5] overflow-hidden">
          <div className="absolute inset-0">
            <ProductImage
              src={colourway.image}
              alt={`${card.style_name}${colourway.colour ? ` in ${colourway.colour}` : ""}`}
              articleNumber={colourway.article_number}
              priority={priority}
            />
          </div>

          {soldOut && (
            <span className="absolute left-3 top-3 bg-ink px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-paper">
              Out of stock
            </span>
          )}
          {colourway.condition !== "new" && (
            <span className="absolute right-3 top-3">
              <ConditionTag condition={colourway.condition as Condition} />
            </span>
          )}
        </div>
      </Link>

      <div className="mt-1.5">
        <p className="mono-ui text-graphite-ink">
          {colourway.colour || `Art. ${colourway.article_number}`}
          {multi && ` · ${card.colourways.length} colours`}
        </p>

        {multi && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Colourways">
            {card.colourways.map((cw, i) => (
              <button
                key={cw.article_number}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                title={`${cw.colour || cw.article_number}${
                  cw.total_quantity === 0 ? " — out of stock" : ""
                }`}
                // 24px minimum touch target (WCAG 2.2 AA, 2.5.8).
                className={[
                  "h-6 w-6 border transition-colors duration-150",
                  i === active ? "border-ink" : "border-sand hover:border-graphite",
                ].join(" ")}
                style={{ backgroundColor: cw.colour_hex ?? "var(--color-paper-sunken)" }}
              >
                <span className="sr-only">
                  {cw.colour || cw.article_number}
                  {cw.total_quantity === 0 ? ", out of stock" : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {showStrip && (
          <div className="mt-3">
            <AvailabilityStrip sizes={card.sizes} />
          </div>
        )}

        <p className="mono-ui mt-2 text-graphite-ink">{PRICE_ON_REQUEST}</p>
      </div>
    </article>
  );
}
