"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { stockAsAt, PRICE_CAVEAT } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/domain/types";

const FOOTER_CATEGORIES = [
  "polos",
  "mid-layers",
  "outerwear",
  "shoes",
  "caps",
  "golf-bags",
  "balls",
  "accessories",
] as const;

export function SiteFooter({ stockDate }: { stockDate: string | null }) {
  const pathname = usePathname();

  // The admin panel is a working tool, not a storefront. A marketing footer
  // under the stock importer is noise, and it pushes the import history off
  // the bottom of the screen.
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="no-print border-t border-sand mt-20 pb-28 lg:pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark className="h-7 w-auto text-fairway" />
            {/* §14.6: the old "best value golf gear" line is a discount-retail
                promise. This says who the site serves instead. */}
            <p className="mt-4 text-sm text-graphite-ink max-w-xs">
              Corporate golf kit for UAE companies — golf days, tournaments,
              client gifting and staff kit, specified from stock in Dubai.
            </p>
          </div>

          <nav aria-label="Catalogue">
            <h2 className="label-caps mb-3">Catalogue</h2>
            <ul className="space-y-2 text-sm">
              {FOOTER_CATEGORIES.map((c) => (
                <li key={c}>
                  <Link
                    href={`/catalogue/${c}`}
                    className="text-graphite-ink hover:text-fairway transition-colors duration-150"
                  >
                    {CATEGORY_LABELS[c]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="label-caps mb-3">Company</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-graphite-ink hover:text-fairway">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-graphite-ink hover:text-fairway">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-graphite-ink hover:text-fairway">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-graphite-ink hover:text-fairway">
                  Privacy
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="label-caps mb-3">How pricing works</h2>
            <p className="text-sm text-graphite-ink">
              Everything on this site is a quote request. Nothing is charged
              online and no price is final until our team confirms it.
            </p>
            <p className="mt-3 tabular text-xs text-graphite-ink">{stockAsAt(stockDate)}</p>
          </div>
        </div>

        <div className="rule mt-10 pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-graphite-ink">
            © {new Date().getFullYear()} Pin High UAE. Prices in AED. {PRICE_CAVEAT}.
          </p>
          <p className="text-xs text-graphite-ink">
            5% UAE VAT applies. Tax invoices are raised by our sales team.
          </p>
        </div>
      </div>
    </footer>
  );
}
