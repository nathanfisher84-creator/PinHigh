"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Facet } from "@/lib/repo/catalogue";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import { stockAsAt } from "@/lib/format";
import { useCartTotals } from "@/lib/cart/store";
import { Wordmark } from "./Wordmark";

/**
 * Site header.
 *
 * Deliberately quiet: a wordmark, four words of navigation, a search field and
 * the running total. The first version carried a second row of brand links and
 * a stock date badge, which made the top of every page busier than the content
 * underneath it. Pin High sells one brand now, so the brand rail earned
 * nothing and is gone.
 */

interface Props {
  brands: Facet[];
  categories: Facet[];
  stockDate: string | null;
  announcement: string;
}

const NAV = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ categories, stockDate, announcement }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const totals = useCartTotals();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/admin")) return null;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/catalogue?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      {announcement && (
        <div className="on-fairway text-center text-sm px-4 py-2.5">{announcement}</div>
      )}

      <header className="no-print sticky top-0 z-30 bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
          <div className="flex h-20 items-center justify-between gap-8 border-b border-sand">
            <Link href="/" aria-label="Pin High UAE, home" className="shrink-0">
              <Wordmark className="h-7 w-auto text-ink" />
            </Link>

            <nav
              aria-label="Main"
              className="hidden lg:flex items-center gap-9 text-sm"
            >
              {NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "link-underline hover:link-underline-on py-1",
                      active ? "link-underline-on" : "",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-5">
              <form
                onSubmit={submitSearch}
                role="search"
                className="hidden md:block w-56"
              >
                <label htmlFor="site-search" className="sr-only">
                  Search by style or article number
                </label>
                <input
                  id="site-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full border-0 border-b border-sand bg-transparent pb-1.5 text-sm placeholder:text-graphite-ink focus:border-ink focus:outline-none transition-colors duration-150"
                />
              </form>

              {totals.units > 0 && (
                <Link
                  href="/quote"
                  className="tabular text-sm bg-ink px-3.5 py-2 text-paper hover:bg-fairway transition-colors duration-150"
                >
                  {totals.units}
                  <span className="sr-only"> units in your order</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                className="lg:hidden label-caps text-ink"
              >
                {menuOpen ? "Close" : "Menu"}
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="lg:hidden border-b border-sand bg-paper">
            <div className="mx-auto max-w-[110rem] px-5 sm:px-8 py-8 space-y-8">
              <form onSubmit={submitSearch} role="search" className="md:hidden">
                <label htmlFor="mobile-search" className="sr-only">
                  Search the catalogue
                </label>
                <input
                  id="mobile-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Style or article number"
                  className="w-full border-0 border-b border-sand bg-transparent pb-2 text-lg focus:border-ink focus:outline-none"
                />
              </form>

              <nav aria-label="Main" className="space-y-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block display text-3xl py-1"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {categories.length > 0 && (
                <nav aria-label="Categories">
                  <p className="label-caps mb-3">Categories</p>
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {categories.map((c) => (
                      <li key={c.value}>
                        <Link href={`/catalogue/${c.value}`} className="block py-1">
                          {CATEGORY_LABELS[c.value as Category] ?? c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <p className="tabular text-xs text-graphite-ink rule-top pt-5">
                {stockAsAt(stockDate)}
              </p>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
