import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/db";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Talk to the Pin High corporate team in Dubai about golf days, tournaments, gifting and staff kit.",
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl display-xl">Contact</h1>
      <p className="mt-4 text-lg text-graphite-ink">
        The fastest route to a price is to build what you need in the catalogue
        and send it as a quote request — it reaches the team with the sizes,
        quantities and your date already attached.
      </p>

      <Link
        href="/catalogue"
        className="mt-6 inline-block bg-fairway px-6 py-3 text-paper hover:bg-ink transition-colors duration-150"
      >
        Browse the catalogue
      </Link>

      <section className="mt-12">
        <h2 className="text-xl">Or get in touch directly</h2>
        <dl className="mt-4 space-y-4">
          {settings.contact_email && (
            <div>
              <dt className="label-caps">Email</dt>
              <dd className="mt-0.5">
                <a
                  href={`mailto:${settings.contact_email}`}
                  className="text-lg underline underline-offset-4 hover:text-fairway"
                >
                  {settings.contact_email}
                </a>
              </dd>
            </div>
          )}

          {settings.contact_phone && (
            <div>
              <dt className="label-caps">Phone</dt>
              <dd className="mt-0.5">
                <a
                  href={`tel:${settings.contact_phone.replace(/[^\d+]/g, "")}`}
                  className="tabular text-lg underline underline-offset-4 hover:text-fairway"
                >
                  {settings.contact_phone}
                </a>
              </dd>
            </div>
          )}

          {settings.contact_whatsapp && (
            <div>
              <dt className="label-caps">WhatsApp</dt>
              <dd className="mt-0.5">
                <a
                  href={`https://wa.me/${settings.contact_whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tabular text-lg underline underline-offset-4 hover:text-fairway"
                >
                  {settings.contact_whatsapp}
                </a>
              </dd>
            </div>
          )}

          <div>
            <dt className="label-caps">Where we are</dt>
            <dd className="mt-0.5 text-lg">Dubai, United Arab Emirates</dd>
          </div>
        </dl>
      </section>

      <section className="mt-12 hairline bg-paper-raised px-5 py-5">
        <h2 className="text-lg">What helps us quote faster</h2>
        <ul className="mt-3 space-y-2 text-sm text-graphite-ink">
          <li>The date you need it by — a golf day has a fixed date and it changes what we offer.</li>
          <li>Roughly how many people, and the split between men&apos;s and ladies&apos; sizing.</li>
          <li>Whether you want your logo on it, and on which items.</li>
          <li>Where it is being delivered.</li>
        </ul>
      </section>

      {/* §14.5 — stray consumer visitors from the old Shopify rankings. */}
      <section className="mt-10">
        <h2 className="text-lg">Buying for yourself?</h2>
        <p className="mt-2 text-sm text-graphite-ink">
          We supply companies rather than individual golfers, so we don&apos;t sell
          single items here. Get in touch anyway and we&apos;ll point you at a
          retailer — and if your company runs a golf day, we&apos;d be glad to help
          with that.
        </p>
      </section>
    </div>
  );
}
