import type { Metadata } from "next";
import Link from "next/link";
import { listBrands } from "@/lib/repo/catalogue";

export const metadata: Metadata = {
  title: "About",
  description:
    "Pin High is a Dubai-based distributor supplying UAE companies with golf apparel, footwear and equipment for corporate events, gifting and staff kit.",
};

export default async function AboutPage() {
  const brands = await listBrands();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="display text-3xl uppercase">About Pin High</h1>

      <div className="mt-6 space-y-5 text-lg">
        <p>
          We supply UAE companies with golf kit. Tournaments and golf days,
          client gifting, staff uniform and prize tables — specified from stock we
          hold in Dubai, across the brands your people already recognise.
        </p>
        <p>
          We are a distributor rather than an own-label supplier, so what you see
          here is genuine branded product. Where you want your own logo on it, we
          apply that too.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="text-xl">How buying from us works</h2>
        <div className="mt-4 space-y-4 text-graphite-ink">
          <p>
            This site is a catalogue and a quote tool, not a shop. You build the
            size run you need, tell us where it is going and when, and our team
            comes back with a price that accounts for the quantity, the branding
            and the delivery.
          </p>
          <p>
            Nothing is charged online and nothing is reserved until we confirm it.
            That is deliberate: corporate orders almost always change once we
            have talked them through, and pretending otherwise would just mean
            unpicking a transaction afterwards.
          </p>
          <p>
            We do not publish prices. What a corporate order costs depends on the
            quantity, the branding and the delivery, so we price each request on
            its own rather than putting a figure on a page that would be wrong for
            most people who read it. Quotes are in AED and exclude 5% UAE VAT.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl">Stock</h2>
        <div className="mt-4 space-y-4 text-graphite-ink">
          <p>
            Availability on this site comes from our own stock file, and every
            page tells you the date that file was uploaded. It is not a live
            feed — if a size run matters to you, ask and we will check it against
            the warehouse before you commit to anything.
          </p>
          <p>
            Where we list pre-owned or ex-display equipment, it is labelled as
            such everywhere it appears and can be filtered out entirely.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl">Brands we carry</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {brands.map((b) => (
            <li key={b.value}>
              <Link
                href={`/brand/${encodeURIComponent(b.value.toLowerCase())}`}
                className="hairline bg-paper-raised px-3 py-1.5 text-sm hover:border-fairway transition-colors duration-150 inline-block"
              >
                {b.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 rule pt-8">
        <Link
          href="/catalogue"
          className="btn-primary"
        >
          Browse the catalogue
        </Link>
      </div>
    </div>
  );
}
