"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Facet } from "@/lib/repo/catalogue";
import {
  CATEGORY_LABELS,
  GENDER_LABELS,
  type Category,
  type Gender,
} from "@/lib/domain/types";

/**
 * The Catalogue menu.
 *
 * Categories and fit were previously reachable only by opening a "Filters"
 * panel on the listing page, which meant the site had no browsable structure —
 * a buyer who wanted caps had to know to go looking. This puts the whole
 * catalogue one click from every page.
 *
 * Only categories that actually hold stock are listed, so the menu never
 * offers a dead end. It fills out on its own as articles are categorised.
 *
 * Fit uses a query rather than its own route because `/catalogue/[category]`
 * already owns that path segment, and `?gender=` is the same filter the
 * listing page and the Shopify redirect map already use.
 */

interface Props {
  categories: Facet[];
  genders: Facet[];
}

export function CatalogueMenu({ categories, genders }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes and returns focus to the trigger; a click elsewhere closes.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const hasSomething = categories.length > 0 || genders.length > 0;

  return (
    <div
      ref={wrapRef}
      className="relative"
      // Hover opens on pointer devices; the button still works by keyboard
      // and on touch, where hover does not exist.
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="catalogue-menu"
        onClick={() => setOpen((v) => !v)}
        className="link-underline hover:link-underline-on py-1 flex items-center gap-1.5"
      >
        Catalogue
        <span
          aria-hidden="true"
          className={[
            "inline-block text-[0.6em] transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
        >
          ▼
        </span>
      </button>

      {open && hasSomething && (
        <div
          id="catalogue-menu"
          className="absolute left-1/2 top-full z-40 -translate-x-1/2 pt-4"
        >
          <div className="w-[min(46rem,90vw)] border border-sand bg-paper shadow-rail">
            <div className="grid gap-10 p-8 sm:grid-cols-[1.6fr_1fr]">
              {categories.length > 0 && (
                <nav aria-label="Shop by category">
                  <p className="label-caps mb-4">By category</p>
                  <ul className="grid grid-cols-2 gap-x-8">
                    {categories.map((c) => (
                      <li key={c.value}>
                        <Link
                          href={`/catalogue/${c.value}`}
                          onClick={() => setOpen(false)}
                          className="group flex items-baseline justify-between gap-3 border-b border-sand py-2.5 hover:border-ink transition-colors duration-150"
                        >
                          <span className="group-hover:text-fairway transition-colors duration-150">
                            {CATEGORY_LABELS[c.value as Category] ?? c.label}
                          </span>
                          <span className="tabular text-xs text-graphite-ink">
                            {c.count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <div>
                {genders.length > 0 && (
                  <nav aria-label="Shop by fit" className="mb-8">
                    <p className="label-caps mb-4">By fit</p>
                    <ul>
                      {genders.map((g) => (
                        <li key={g.value}>
                          <Link
                            href={`/catalogue?gender=${encodeURIComponent(g.value)}`}
                            onClick={() => setOpen(false)}
                            className="group flex items-baseline justify-between gap-3 border-b border-sand py-2.5 hover:border-ink transition-colors duration-150"
                          >
                            <span className="group-hover:text-fairway transition-colors duration-150">
                              {GENDER_LABELS[g.value as Gender] ?? g.label}
                            </span>
                            <span className="tabular text-xs text-graphite-ink">
                              {g.count}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}

                <Link
                  href="/catalogue"
                  onClick={() => setOpen(false)}
                  className="inline-block bg-ink px-5 py-3 text-sm text-paper hover:bg-fairway transition-colors duration-150"
                >
                  Everything in stock
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
