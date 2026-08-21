"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { stockAsAt } from "@/lib/format";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";
import type { Facet } from "@/lib/repo/catalogue";

export function SiteFooter({
  stockDate,
  categories,
}: {
  stockDate: string | null;
  /** Only categories that hold stock — a footer link to an empty
   *  category is a dead end, and the list was hardcoded before. */
  categories: Facet[];
}) {
  const pathname = usePathname();

  // The admin panel is a working tool, not a storefront.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="no-print on-fairway mt-24 pb-28 lg:pb-0">
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12 pt-16 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_auto] lg:gap-24">
          <div>
            <Wordmark className="h-8 w-auto text-on-fairway" />
            {/* §14.6: the old "best value golf gear" line was a discount promise.
                This says who the site serves instead. */}
            <p className="mt-6 measure text-lg text-on-fairway-dim">
              Corporate golf kit for UAE companies — golf days, tournaments,
              client gifting and staff kit, specified from stock in Dubai.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3 lg:gap-x-16">
            <nav aria-label="Catalogue">
              <h2 className="label-caps text-on-fairway-dim mb-4">Catalogue</h2>
              <ul className="space-y-2.5 text-sm">
                {categories.slice(0, 5).map((c) => (
                  <li key={c.value}>
                    <Link
                      href={`/catalogue/${c.value}`}
                      className="link-underline hover:link-underline-on"
                    >
                      {CATEGORY_LABELS[c.value as Category] ?? c.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/catalogue" className="link-underline hover:link-underline-on">
                    Everything
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Company">
              <h2 className="label-caps text-on-fairway-dim mb-4">Company</h2>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link href="/about" className="link-underline hover:link-underline-on">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="link-underline hover:link-underline-on">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="link-underline hover:link-underline-on">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="link-underline hover:link-underline-on">
                    Privacy
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="col-span-2 sm:col-span-1">
              <h2 className="label-caps text-on-fairway-dim mb-4">How pricing works</h2>
              <p className="text-sm text-on-fairway-dim measure">
                Everything here is a quote request. Nothing is charged online and
                no price is final until our team confirms it.
              </p>
              <p className="tabular mt-4 text-xs text-on-fairway-dim">
                {stockAsAt(stockDate)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-fairway-line py-8 text-xs text-on-fairway-dim sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Pin High UAE. Prices in AED, excluding 5% VAT.</p>
          <p>Indicative — excludes VAT, branding and delivery.</p>
        </div>
      </div>
    </footer>
  );
}
