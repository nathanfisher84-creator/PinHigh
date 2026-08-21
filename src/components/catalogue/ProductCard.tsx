"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogueCard } from "@/lib/repo/catalogue";
import { CONDITION_LABELS, type Condition } from "@/lib/domain/types";
import { amount, money, PRICE_CAVEAT_SHORT } from "@/lib/format";
import { ProductImage } from "./ProductImage";
import { AvailabilityStrip } from "./AvailabilityStrip";
import { ConditionTag } from "./ConditionTag";

/**
 * A listing card (spec §6.2).
 *
 * Where a style_group is set, sibling colourways collapse into one card and
 * the swatches switch the image and article number in place — a buyer scanning
 * for "that polo" should see the polo once, not five times.
 */
export function ProductCard({ card, priority }: { card: CatalogueCard; priority?: boolean }) {
  const [active, setActive] = useState(0);
  const colourway = card.colourways[active] ?? card.colourways[0];
  const multi = card.colourways.length > 1;

  // The size run shown belongs to the lead colourway. Switching swatch changes
  // the article number and image here; the full run lives on the product page.
  const showStrip = active === 0 && card.sizes.length > 0;

  return (
    <article className="group flex flex-col">
      <Link
        href={`/product/${encodeURIComponent(colourway.article_number)}`}
        className="block focus-visible:outline-2 focus-visible:outline-fairway"
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-paper-sunken hairline">
          <ProductImage
            src={colourway.image}
            alt={`${card.style_name} in ${colourway.colour}`}
            articleNumber={colourway.article_number}
            priority={priority}
          />
          {colourway.total_quantity === 0 && (
            <span className="absolute left-0 top-0 bg-ink/85 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-paper">
              Out of stock
            </span>
          )}
          {colourway.condition !== "new" && (
            <span className="absolute right-0 top-0">
              <ConditionTag condition={colourway.condition as Condition} />
            </span>
          )}
        </div>
      </Link>

      <div className="mt-3 flex flex-1 flex-col">
        {/* Not label-caps: several brands are deliberately lowercase (adidas),
            and a distributor's catalogue should render a brand as the brand
            writes it. */}
        <p className="text-2xs font-semibold tracking-wider text-graphite-ink">
          {card.brand}
        </p>

        <h3 className="mt-1 text-base font-medium leading-snug">
          <Link
            href={`/product/${encodeURIComponent(colourway.article_number)}`}
            className="hover:text-fairway transition-colors duration-150"
          >
            {card.style_name}
          </Link>
        </h3>

        <p className="mt-0.5 text-sm text-graphite-ink">
          {colourway.colour}
          {multi && (
            <span className="tabular"> · {card.colourways.length} colours</span>
          )}
        </p>

        {/* Colour switcher. Buttons, not links — switching a swatch is a change
            of view, and navigating away from a card the buyer is scanning
            would lose their place. */}
        {multi && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Colourways">
            {card.colourways.map((cw, i) => (
              <button
                key={cw.article_number}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                title={`${cw.colour} — article ${cw.article_number}`}
                // 24px minimum touch target (WCAG 2.2 AA, 2.5.8). At 20px these
                // were genuinely hard to hit on a phone, which is the assumed
                // context (§11).
                className={[
                  "h-6 w-6 border transition-colors duration-150",
                  i === active ? "border-ink" : "border-sand hover:border-graphite",
                ].join(" ")}
                style={{ backgroundColor: cw.colour_hex ?? "var(--color-paper-sunken)" }}
              >
                <span className="sr-only">
                  {cw.colour}
                  {cw.total_quantity === 0 ? ", out of stock" : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {showStrip && (
          <div className="mt-2.5">
            <AvailabilityStrip sizes={card.sizes} />
          </div>
        )}

        <div className="mt-auto pt-3">
          {/* Currency on the card itself. A bare "266" next to "RRP 666" with
              the currency only in the footer is exactly the ambiguity a buyer
              pricing a 200-unit run cannot afford. */}
          <p className="tabular text-sm">
            <strong className="font-bold">{money(card.price_wholesale)}</strong>
            {card.rrp !== null && (
              <span className="text-graphite-ink">
                {" "}
                · RRP {amount(card.rrp)}
              </span>
            )}
          </p>
          <p className="text-2xs text-graphite-ink">{PRICE_CAVEAT_SHORT}</p>
          <p className="tabular text-2xs text-graphite-ink mt-1">
            Art. {colourway.article_number}
          </p>
        </div>
      </div>
    </article>
  );
}
