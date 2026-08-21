"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Two ways stock changes, two tabs: corrections made by hand, and the adidas
 * files. Kept as separate pages so the upload flow's preview-then-commit step
 * never shares a screen with a half-edited grid of quantities.
 */
const TABS = [
  { href: "/admin/stock", label: "Current stock", exact: true },
  { href: "/admin/stock/uploads", label: "File uploads" },
  { href: "/admin/stock/history", label: "Adjustment history" },
];

export function StockSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Stock sections" className="mt-4 flex gap-1 border-b border-sand">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150",
              active
                ? "border-fairway font-medium text-ink"
                : "border-transparent text-graphite-ink hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
