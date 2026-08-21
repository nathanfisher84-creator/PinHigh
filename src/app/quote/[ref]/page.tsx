import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteByReference } from "@/lib/repo/quotes";
import { getSettings } from "@/lib/db";
import { waMeLink } from "@/lib/notify/whatsapp";
import { REFERENCE_PATTERN } from "@/lib/validation/quote";
import { PrintButton } from "@/components/ui/PrintButton";
import { formatDate, PRICE_NOTE, units } from "@/lib/format";

/**
 * Confirmation (spec §7.2 step 6).
 *
 * "The confirmation says a quote has been requested and states when someone
 * will respond. It never says 'confirmed'." The vocabulary holds end to end:
 * Request a quote → Quote request sent → Quote reference PH-Q-2026-0417.
 */

type Params = Promise<{ ref: string }>;

export const metadata: Metadata = {
  title: "Quote request sent",
  robots: { index: false, follow: false },
};

export default async function QuoteConfirmationPage({ params }: { params: Params }) {
  const { ref } = await params;
  const reference = decodeURIComponent(ref).toUpperCase();

  // Reject anything that is not reference-shaped before touching the database.
  if (!REFERENCE_PATTERN.test(reference)) notFound();

  const quote = await getQuoteByReference(reference);
  if (!quote) notFound();

  const settings = await getSettings();
  const responseHours = Number(settings.quote_response_hours) || 24;

  // Did the buyer's own copy actually leave? Used below so the page never
  // promises an email that was skipped because the channel isn't connected.
  const buyerCopySent = quote.notified_email.some(
    async (entry) => entry.recipient === quote.email && entry.status === "sent",
  );

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
      <div className="hairline border-fairway bg-fairway-wash px-6 py-6">
        <p className="label-caps">Quote request sent</p>
        <h1 className="mt-2 text-2xl sm:text-3xl display-xl">
          Thanks — we have your request.
        </h1>
        <p className="mt-3 tabular text-lg">
          Quote reference <strong className="font-bold">{quote.reference}</strong>
        </p>
        <p className="mt-3 max-w-2xl">
          This is a <strong>request for a quote</strong>, not an order. Nothing has
          been charged and no stock is reserved. Our team will price it —
          including branding and delivery — and come back to you within{" "}
          {responseHours} hours on {quote.email}.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 no-print">
        {settings.contact_whatsapp && (
          <a
            href={waMeLink(settings.contact_whatsapp, quote.reference, quote.company_name)}
            target="_blank"
            rel="noopener noreferrer"
            className="hairline px-5 py-2.5 text-sm hover:border-fairway transition-colors duration-150"
          >
            Send us a WhatsApp about this
          </a>
        )}
        {/* Two ways to keep a copy: a real file, and print-to-PDF. */}
        <a
          href={`/quote/${encodeURIComponent(quote.reference)}/download`}
          download
          className="hairline px-5 py-2.5 text-sm hover:border-fairway transition-colors duration-150"
        >
          Download your request (Excel)
        </a>
        <PrintButton />
        <Link
          href="/catalogue"
          className="bg-fairway px-5 py-2.5 text-sm text-paper hover:bg-ink transition-colors duration-150"
        >
          Back to the catalogue
        </Link>
      </div>

      {/* Summary */}
      <section className="mt-10">
        <h2 className="label-caps mb-3">What you asked for</h2>

        <div className="hairline bg-paper-raised overflow-x-auto scroll-x">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-sand">
                <th scope="col" className="px-4 py-2 text-left label-caps">Article</th>
                <th scope="col" className="px-4 py-2 text-left label-caps">Item</th>
                <th scope="col" className="px-4 py-2 text-left label-caps">Colour</th>
                <th scope="col" className="px-4 py-2 text-left label-caps">Size</th>
                <th scope="col" className="px-4 py-2 text-right label-caps">Qty</th>
                <th scope="col" className="px-4 py-2 text-left label-caps">Branding</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-b border-sand last:border-0">
                  <td className="px-4 py-2 tabular">{line.article_number}</td>
                  <td className="px-4 py-2">
                    <span className="text-graphite-ink">{line.brand}</span>{" "}
                    {line.style_name}
                  </td>
                  <td className="px-4 py-2">{line.colour}</td>
                  <td className="px-4 py-2 tabular">{line.size}</td>
                  <td className="px-4 py-2 text-right tabular">{line.quantity}</td>
                  <td className="px-4 py-2 text-xs">
                    {line.branding_placements?.length
                      ? line.branding_placements.join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink font-medium">
                <td colSpan={4} className="px-4 py-3">
                  Total
                </td>
                <td className="px-4 py-3 text-right tabular">{quote.total_units}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-3 text-xs text-graphite-ink">
          {PRICE_NOTE}{" "}
          {quote.has_branding && "Branding is quoted separately. "}
          This is what you specified — our team will come back with the price.
        </p>
      </section>

      {/* Details */}
      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="label-caps mb-3">Your details</h2>
          <dl className="text-sm space-y-1.5">
            <Row label="Company" value={quote.company_name} />
            {quote.trn && <Row label="TRN" value={quote.trn} mono />}
            <Row
              label="Contact"
              value={
                quote.contact_role
                  ? `${quote.contact_name}, ${quote.contact_role}`
                  : quote.contact_name
              }
            />
            <Row label="Email" value={quote.email} />
            <Row label="Phone" value={quote.phone} mono />
          </dl>
        </div>

        <div>
          <h2 className="label-caps mb-3">Delivery</h2>
          <dl className="text-sm space-y-1.5">
            <Row label="Deliver to" value={quote.delivery_emirate} />
            <Row
              label="Needed by"
              value={quote.required_by ? formatDate(quote.required_by) : "Not specified"}
            />
            <Row label="Total" value={units(quote.total_units)} />
            <Row label="Branding" value={quote.has_branding ? "Yes" : "No"} />
          </dl>
        </div>
      </section>

      {quote.notes && (
        <section className="mt-8">
          <h2 className="label-caps mb-2">Your notes</h2>
          <p className="hairline bg-paper-raised px-4 py-3 text-sm whitespace-pre-wrap">
            {quote.notes}
          </p>
        </section>
      )}

      {/* Only claim the email went out if it actually did. Telling a buyer to
          check an inbox that will never receive anything is the kind of small
          lie that costs a sales conversation later. */}
      <p className="mt-10 rule pt-6 text-sm text-graphite-ink">
        Keep this reference — <span className="tabular">{quote.reference}</span> —
        if you need to chase it.{" "}
        {buyerCopySent
          ? `A copy has been emailed to ${quote.email}.`
          : "We have it on our side and will reply to you directly."}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-sand pb-1.5">
      <dt className="text-graphite-ink shrink-0">{label}</dt>
      <dd className={`text-right ${mono ? "tabular" : ""}`}>{value}</dd>
    </div>
  );
}
