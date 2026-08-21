"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Facet } from "@/lib/repo/catalogue";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import { stockAsAt } from "@/lib/format";
import { useCartTotals } from "@/lib/cart/store";
import { Wordmark } from "./Wordmark";

interface Props {
  brands: Facet[];
  categories: Facet[];
  stockDate: string | null;
  announcement: string;
}

export function SiteHeader({ brands, categories, stockDate, announcement }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const totals = useCartTotals();

  // Close the mobile menu on navigation — leaving it open over the new page is
  // the classic mobile nav bug.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/catalogue?q=${encodeURIComponent(q)}`);
  };

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      {announcement && (
        <div className="bg-fairway text-paper text-center text-sm px-4 py-2">
          {announcement}
        </div>
      )}

      <header className="no-print border-b border-sand bg-paper sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 h-16">
            <Link href="/" className="shrink-0" aria-label="Pin High UAE, home">
              <Wordmark className="h-7 w-auto text-fairway" />
            </Link>

            <nav aria-label="Main" className="hidden lg:flex items-center gap-6 text-sm">
              <Link href="/catalogue" className="hover:text-fairway transition-colors duration-150">
                Catalogue
              </Link>
              <Link href="/brands" className="hover:text-fairway transition-colors duration-150">
                Brands
              </Link>
              <Link href="/about" className="hover:text-fairway transition-colors duration-150">
                About
              </Link>
              <Link href="/contact" className="hover:text-fairway transition-colors duration-150">
                Contact
              </Link>
            </nav>

            <form
              onSubmit={submitSearch}
              role="search"
              className="hidden md:flex items-center flex-1 max-w-xs"
            >
              <label htmlFor="site-search" className="sr-only">
                Search the catalogue by style, colour or article number
              </label>
              <input
                id="site-search"
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Style, colour or article no."
                className="w-full hairline bg-paper-raised px-3 py-2 text-sm placeholder:text-graphite-ink focus:outline-none focus:border-fairway"
              />
            </form>

            <div className="flex items-center gap-3">
              {totals.units > 0 && (
                <Link
                  href="/quote"
                  className="hidden sm:block tabular text-sm text-fairway font-medium"
                >
                  {totals.units} units
                </Link>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                className="lg:hidden hairline px-3 py-2 text-sm"
              >
                {menuOpen ? "Close" : "Menu"}
              </button>
            </div>
          </div>

          {/* Brand-first navigation. §6.2: a buyer wants adidas polos, not
              polos, so brands lead and categories follow. */}
          <div className="hidden lg:flex items-center gap-4 h-10 overflow-x-auto scroll-x text-xs">
            <span className="label-caps shrink-0">Brands</span>
            {brands.slice(0, 10).map((b) => (
              <Link
                key={b.value}
                href={`/brand/${encodeURIComponent(b.value.toLowerCase())}`}
                className="shrink-0 text-graphite-ink hover:text-fairway transition-colors duration-150"
              >
                {b.label}
              </Link>
            ))}
            <span className="ml-auto shrink-0 tabular text-graphite-ink">
              {stockAsAt(stockDate)}
            </span>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="lg:hidden border-t border-sand bg-paper-raised">
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 space-y-5">
              <form onSubmit={submitSearch} role="search" className="md:hidden">
                <label htmlFor="mobile-search" className="sr-only">
                  Search the catalogue
                </label>
                <input
                  id="mobile-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Style, colour or article no."
                  className="w-full hairline bg-paper px-3 py-2.5 text-sm focus:outline-none focus:border-fairway"
                />
              </form>

              <nav aria-label="Categories">
                <p className="label-caps mb-2">Categories</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {categories.map((c) => (
                    <li key={c.value}>
                      <Link href={`/catalogue/${c.value}`} className="block py-1">
                        {CATEGORY_LABELS[c.value as Category] ?? c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav aria-label="Brands">
                <p className="label-caps mb-2">Brands</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {brands.map((b) => (
                    <li key={b.value}>
                      <Link
                        href={`/brand/${encodeURIComponent(b.value.toLowerCase())}`}
                        className="block py-1"
                      >
                        {b.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav aria-label="More" className="rule pt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link href="/about">About</Link>
                <Link href="/contact">Contact</Link>
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
              </nav>

              <p className="tabular text-xs text-graphite-ink">{stockAsAt(stockDate)}</p>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
