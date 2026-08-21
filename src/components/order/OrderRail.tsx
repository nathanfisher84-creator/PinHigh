"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartTotals } from "@/lib/cart/store";
import { PRICE_ON_REQUEST, units } from "@/lib/format";

/**
 * The running total (spec §6.3).
 *
 * Persistent rail on desktop, bottom bar on mobile, showing units, lines and
 * indicative value with `Indicative` beside the figure. It sits at the root
 * layout so it survives navigation — a buyer taking one style in three colours
 * must never watch their run reset.
 *
 * This is the one place §10 permits an elevation, because it floats over
 * content and needs an edge.
 */
export function OrderRail() {
  const totals = useCartTotals();
  const pathname = usePathname();

  // The rail is the route to the review page; on the review page and beyond it
  // would just be pointing at itself.
  const hidden =
    totals.units === 0 ||
    pathname === "/quote" ||
    pathname.startsWith("/quote/") ||
    pathname.startsWith("/admin");

  if (hidden) return null;

  return (
    <div
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-paper-raised"
      role="region"
      aria-label="Your order so far"
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="tabular text-sm sm:text-base">
            <strong className="font-bold">{units(totals.units)}</strong>
            <span className="text-graphite-ink">
              {" "}
              · {totals.lines} {totals.lines === 1 ? "line" : "lines"}
              {totals.articles > 1 ? ` · ${totals.articles} styles` : ""}
            </span>
          </p>
          <p className="text-xs sm:text-sm text-graphite-ink truncate">
            {PRICE_ON_REQUEST}
          </p>
        </div>

        <Link
          href="/quote"
          className="shrink-0 bg-fairway px-4 py-2.5 sm:px-6 sm:py-3 text-paper text-sm font-medium hover:bg-ink transition-colors duration-150"
        >
          Review and request a quote
        </Link>
      </div>
    </div>
  );
}
