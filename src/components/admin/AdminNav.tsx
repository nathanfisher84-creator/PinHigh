"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@/lib/repo/admin-users";

const LINKS: { href: string; label: string; exact?: boolean; ownerOnly?: boolean }[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/quotes", label: "Quote requests" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/recipients", label: "Recipients" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/users", label: "Users", ownerOnly: true },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/help", label: "Help" },
];

export function AdminNav({ role }: { role: AdminRole }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto scroll-x -mb-px">
      {LINKS.filter((link) => !link.ownerOnly || role === "owner").map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={[
              "shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors duration-150",
              active
                ? "border-fairway text-ink font-medium"
                : "border-transparent text-graphite-ink hover:text-ink",
            ].join(" ")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
