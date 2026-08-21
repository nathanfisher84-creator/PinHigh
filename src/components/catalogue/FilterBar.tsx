"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import type { Facet } from "@/lib/repo/catalogue";
import { CATEGORY_LABELS, GENDER_LABELS, CONDITION_LABELS } from "@/lib/domain/types";

/**
 * Catalogue filters (spec §6.2).
 *
 * Brand comes first because that is how trade buyers navigate — a buyer wants
 * adidas polos, not polos. Everything is driven through the URL so a filtered
 * view can be pasted to a colleague, which is the same sharing behaviour §6.4
 * assumes for the basket.
 */

interface Props {
  facets: {
    brands: Facet[];
    categories: Facet[];
    genders: Facet[];
    conditions: Facet[];
  };
  resultCount: number;
  /** Set when the page already implies a filter, e.g. a category route. */
  lockedFilter?: { key: string; value: string };
}

const LABELS: Record<string, (v: string) => string> = {
  category: (v) => CATEGORY_LABELS[v as keyof typeof CATEGORY_LABELS] ?? v,
  gender: (v) => GENDER_LABELS[v as keyof typeof GENDER_LABELS] ?? v,
  condition: (v) => CONDITION_LABELS[v as keyof typeof CONDITION_LABELS] ?? v,
};

export function FilterBar({ facets, resultCount, lockedFilter }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const selected = useCallback(
    (key: string): string[] => params.getAll(key).filter(Boolean),
    [params],
  );

  const apply = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggle = (key: string, value: string) =>
    apply((p) => {
      const current = p.getAll(key);
      p.delete(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of next) p.append(key, v);
    });

  const activeCount =
    ["brand", "category", "gender", "condition", "colour"].reduce(
      (n, k) => n + selected(k).length,
      0,
    ) + (params.get("stock") === "1" ? 1 : 0);

  const groups: { key: string; label: string; options: Facet[] }[] = [
    { key: "brand", label: "Brand", options: facets.brands },
    { key: "category", label: "Category", options: facets.categories },
    { key: "gender", label: "Gender", options: facets.genders },
  ];

  // Condition only appears once there is more than one condition to choose
  // between — an all-new catalogue does not need the filter, and offering it
  // implies there is used stock in here when there is not (§10).
  if (facets.conditions.length > 1) {
    groups.push({ key: "condition", label: "Condition", options: facets.conditions });
  }

  const visibleGroups = groups.filter((g) => g.key !== lockedFilter?.key);

  return (
    <div className="no-print border-y border-sand bg-paper sticky top-20 z-20">
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="filter-panel"
              className="hairline px-3 py-2 text-sm hover:border-fairway transition-colors duration-150"
            >
              Filters
              {activeCount > 0 && (
                <span className="tabular ml-2 text-fairway font-medium">{activeCount}</span>
              )}
            </button>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={params.get("stock") === "1"}
                onChange={(e) =>
                  apply((p) => {
                    if (e.target.checked) p.set("stock", "1");
                    else p.delete("stock");
                  })
                }
                className="h-4 w-4 accent-[var(--color-fairway)]"
              />
              In stock only
            </label>
          </div>

          <div className="flex items-center gap-4">
            <p className="tabular text-sm text-graphite-ink">
              {resultCount} {resultCount === 1 ? "style" : "styles"}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only sm:not-sr-only label-caps">Sort</span>
              <select
                value={params.get("sort") ?? "relevance"}
                onChange={(e) =>
                  apply((p) => {
                    if (e.target.value === "relevance") p.delete("sort");
                    else p.set("sort", e.target.value);
                  })
                }
                className="hairline bg-paper-raised px-2 py-1.5 text-sm focus:outline-none focus:border-fairway"
              >
                <option value="relevance">In stock first</option>
                <option value="name">Name A–Z</option>
                <option value="stock">Deepest stock</option>
              </select>
            </label>
          </div>
        </div>

        {/* Active filters, always visible so a buyer can see why the count is
            what it is without opening the panel. */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 pb-3">
            {["brand", "category", "gender", "condition"].flatMap((key) =>
              selected(key).map((value) => (
                <button
                  key={`${key}-${value}`}
                  type="button"
                  onClick={() => toggle(key, value)}
                  className="hairline bg-paper-raised px-2 py-1 text-xs hover:border-flag hover:text-flag-ink transition-colors duration-150"
                >
                  {(LABELS[key] ?? ((v: string) => v))(value)}
                  <span aria-hidden="true"> ×</span>
                  <span className="sr-only">, remove filter</span>
                </button>
              )),
            )}
            <button
              type="button"
              onClick={() =>
                apply((p) => {
                  for (const k of ["brand", "category", "gender", "condition", "colour", "stock"]) {
                    p.delete(k);
                  }
                })
              }
              className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
            >
              Clear all
            </button>
          </div>
        )}

        {open && (
          <div id="filter-panel" className="rule py-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visibleGroups.map((group) => (
              <fieldset key={group.key}>
                <legend className="label-caps mb-2">{group.label}</legend>
                <ul className="space-y-1.5 max-h-56 overflow-y-auto scroll-x pr-2">
                  {group.options.map((option) => {
                    const checked = selected(group.key).includes(option.value);
                    return (
                      <li key={option.value}>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(group.key, option.value)}
                            className="h-4 w-4 accent-[var(--color-fairway)]"
                          />
                          <span className="flex-1">
                            {(LABELS[group.key] ?? ((v: string) => v))(option.label)}
                          </span>
                          <span className="tabular text-xs text-graphite-ink">
                            {option.count}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
