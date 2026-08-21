import type { Metadata } from "next";
import { getSettings } from "@/lib/db";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms covering quote requests, pricing, availability and branding at Pin High UAE.",
};

/**
 * Terms (spec §7.1, §11).
 *
 * The commercial model has to be stated here as well as in the interface: a
 * submission is a request, not an order. The interface says it too (§7.1
 * insists it must be "visible in the interface, not buried in terms") — this
 * page exists so the two agree, not so the interface can stop saying it.
 *
 * NOT LEGAL ADVICE. Review before cutover.
 */
export default function TermsPage() {
  const settings = getSettings();
  const email = settings.contact_email || "sales@pinhighuae.com";

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl display-xl">Terms</h1>
      <p className="mt-2 tabular text-sm text-graphite-ink">
        Last updated {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
      </p>

      <div className="mt-8 space-y-8">
        <Section title="This site does not sell you anything">
          <p>
            Everything on this site is a <strong>request for a quote</strong>.
            Submitting one does not create a contract, does not reserve stock and
            does not commit you to buy. No payment is taken here.
          </p>
          <p className="mt-3">
            A contract exists only when we have sent you a written quotation and
            you have accepted it. Until then either side can walk away with
            nothing owed.
          </p>
        </Section>

        <Section title="We do not publish prices">
          <p>
            No price appears on this site. What a corporate order costs depends on
            the quantity, the branding and the delivery, and a figure on a product
            page would be wrong for most of the people reading it.
          </p>
          <p className="mt-3">
            The price that counts is the one on the written quotation we send you.
            Quotations are in UAE Dirhams and exclusive of 5% VAT unless they say
            otherwise.
          </p>
        </Section>

        <Section title="Availability is a snapshot">
          <p>
            Stock figures come from our own stock file and every page shows the
            date that file was uploaded. Between uploads the real position can
            change. Nothing you enter here is held or reserved, and where stock
            has moved we will tell you when we quote.
          </p>
        </Section>

        <Section title="Branding">
          <p>
            Where you ask us to apply your logo, you confirm you own it or are
            authorised to use it, and that applying it does not infringe anyone
            else&apos;s rights. We hold your artwork only to produce your order and
            delete it on request.
          </p>
          <p className="mt-3">
            Branding is quoted separately because the cost depends on the artwork,
            the number of placements and the quantity. We proof artwork with you
            before anything is applied. Branded goods are made to your
            specification and cannot be returned once produced.
          </p>
        </Section>

        <Section title="Condition of goods">
          <p>
            Most of what we supply is new. Where an item is pre-owned or
            ex-display it is labelled as such on the catalogue, on the product
            page and on your confirmation, and you can filter it out entirely.
            Warranty on pre-owned equipment is as stated on the quotation.
          </p>
        </Section>

        <Section title="VAT and invoicing">
          <p>
            Quotations exclude UAE VAT at 5% unless they say otherwise. Your tax
            invoice is raised by our sales team on confirmation of the order, not
            by this site. Give us your TRN if you have one so it appears on the
            invoice.
          </p>
        </Section>

        <Section title="Delivery">
          <p>
            Delivery and lead times are agreed with you as part of the quotation.
            If you have a fixed date — and for a golf day you almost certainly do
            — tell us when you request the quote so we can confirm what is
            achievable before you commit.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the United Arab Emirates, and
            the courts of Dubai have jurisdiction over any dispute arising from
            them.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about any of this go to{" "}
            <a href={`mailto:${email}`} className="underline underline-offset-2">
              {email}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl">{title}</h2>
      <div className="mt-3 text-graphite-ink">{children}</div>
    </section>
  );
}
