import type { Metadata } from "next";
import Link from "next/link";
import { listBrands } from "@/lib/repo/catalogue";

export const metadata: Metadata = {
  title: "Brands",
  description:
    "The golf brands Pin High holds in stock in Dubai for UAE corporate customers.",
};

export default async function BrandsPage() {
  const brands = await listBrands();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl display-xl">Brands</h1>
      <p className="mt-3 max-w-2xl text-graphite-ink">
        We are a multi-brand distributor, not an own-label supplier. Everything
        below is held in stock in Dubai and quoted for corporate quantities.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-px bg-sand sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => (
          <li key={b.value}>
            <Link
              href={`/brand/${encodeURIComponent(b.value.toLowerCase())}`}
              className="flex items-baseline justify-between gap-4 bg-paper px-5 py-6 hover:bg-fairway-wash transition-colors duration-150"
            >
              <span className="text-lg font-medium">{b.label}</span>
              <span className="tabular text-sm text-graphite-ink">
                {b.count} {b.count === 1 ? "style" : "styles"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
