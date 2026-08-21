"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Facet } from "@/lib/repo/catalogue";
import {
  CATEGORY_LABELS,
  GENDER_LABELS,
  type Category,
  type Gender,
} from "@/lib/domain/types";

/**
 * Browse navigation on the listing pages.
 *
 * Categories and fit belong in the open, not behind a "Filters" button. The
 * filter panel is for narrowing a result set; this is how a buyer decides what
 * they are looking at in the first place, and the two are different jobs.
 *
 * The current selection is marked with `aria-current` and a heavier rule, so
 * the page always says where you are.
 */
export function BrowseBar({
  categories,
  genders,
}: {
  categories: Facet[];
  genders: Facet[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const activeCategory = pathname.startsWith("/catalogue/")
    ? pathname.split("/")[2]
    : null;
  const activeGender = params.get("gender");
  const isEverything = pathname === "/catalogue" && !activeGender;

  if (categories.length === 0 && genders.length === 0) return null;

  const pill = (active: boolean) =>
    [
      "whitespace-nowrap border-b-2 pb-2 pt-1 text-sm transition-colors duration-150",
      active
        ? "border-ink text-ink"
        : "border-transparent text-graphite-ink hover:text-ink hover:border-sand",
    ].join(" ");

  return (
    <nav
      aria-label="Browse the catalogue"
      className="no-print border-b border-sand"
    >
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
        <ul className="flex items-center gap-7 overflow-x-auto scroll-x">
          <li>
            <Link
              href="/catalogue"
              aria-current={isEverything ? "page" : undefined}
              className={pill(isEverything)}
            >
              Everything
            </Link>
          </li>

          {categories.map((c) => {
            const active = activeCategory === c.value;
            return (
              <li key={c.value}>
                <Link
                  href={`/catalogue/${c.value}`}
                  aria-current={active ? "page" : undefined}
                  className={pill(active)}
                >
                  {CATEGORY_LABELS[c.value as Category] ?? c.label}
                  <span className="tabular ml-1.5 text-xs text-graphite-ink">
                    {c.count}
                  </span>
                </Link>
              </li>
            );
          })}

          {genders.length > 0 && (
            <li aria-hidden="true" className="h-4 w-px shrink-0 bg-sand" />
          )}

          {genders.map((g) => {
            const active = activeGender === g.value;
            return (
              <li key={g.value}>
                <Link
                  href={`/catalogue?gender=${encodeURIComponent(g.value)}`}
                  aria-current={active ? "page" : undefined}
                  className={pill(active)}
                >
                  {GENDER_LABELS[g.value as Gender] ?? g.label}
                  <span className="tabular ml-1.5 text-xs text-graphite-ink">
                    {g.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
