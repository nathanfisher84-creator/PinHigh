import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteById } from "@/lib/repo/quotes";
import { QuoteAdminControls } from "@/components/admin/QuoteAdminControls";
import { NotificationStatus } from "@/components/admin/NotificationStatus";
import { StatusPill } from "@/components/admin/StatusPill";
import { amount, formatDate, formatDateTime, money, units } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const quote = getQuoteById(id);
  return { title: quote ? quote.reference : "Quote request" };
}

export default async function AdminQuoteDetail({ params }: { params: Params }) {
  const { id } = await params;
  const quote = getQuoteById(id);
  if (!quote) notFound();

  const flagged = quote.lines.filter((l) => l.stock_flag);

  // Group lines into size runs, which is how the sales team reads a request.
  const groups = new Map<string, typeof quote.lines>();
  for (const line of quote.lines) {
    const bucket = groups.get(line.article_number);
    if (bucket) bucket.push(line);
    else groups.set(line.article_number, [line]);
  }

  return (
    <div>
      <Link
        href="/admin/quotes"
        className="text-sm text-graphite-ink hover:text-fairway underline underline-offset-2"
      >
        ← All quote requests
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tabular text-2xl">{quote.reference}</h1>
          <p className="mt-1 text-graphite-ink">
            {quote.company_name} · {formatDateTime(quote.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={quote.status} />
          {quote.has_branding && (
            <span className="bg-fairway px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-paper">
              Branded
            </span>
          )}
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="mt-6 hairline border-flag bg-flag-wash px-4 py-3">
          <p className="font-medium text-flag-ink">
            Availability moved on {flagged.length} {flagged.length === 1 ? "line" : "lines"}{" "}
            after this was submitted
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {flagged.map((l) => (
              <li key={l.id}>
                <span className="tabular">
                  {l.article_number} {l.size}
                </span>{" "}
                — {l.stock_flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          {/* Size runs */}
          <h2 className="label-caps mb-3">What they asked for</h2>
          <div className="space-y-6">
            {[...groups.entries()].map(([article, lines]) => {
              const lead = lines[0];
              const groupUnits = lines.reduce((n, l) => n + l.quantity, 0);
              const groupValue = lines.reduce((n, l) => n + (l.line_total ?? 0), 0);
              return (
                <section key={article} className="hairline bg-paper-raised">
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand px-4 py-3">
                    <div>
                      <p className="text-xs text-graphite-ink">{lead.brand}</p>
                      <h3 className="font-medium">
                        <Link
                          href={`/product/${encodeURIComponent(article)}`}
                          target="_blank"
                          className="hover:text-fairway underline underline-offset-2"
                        >
                          {lead.style_name}
                        </Link>
                      </h3>
                      <p className="text-sm text-graphite-ink">
                        {lead.colour} <span className="tabular">· Art. {article}</span>
                      </p>
                    </div>
                    <p className="tabular text-sm">
                      {units(groupUnits)} · {money(groupValue)}
                    </p>
                  </header>

                  {/* The size run as a run — same reading as the buyer had. */}
                  <div className="overflow-x-auto scroll-x">
                    <table className="w-full text-sm min-w-max">
                      <thead>
                        <tr className="border-b border-sand">
                          <th className="px-4 py-1.5 text-left label-caps">Size</th>
                          {lines.map((l) => (
                            <th key={l.id} className="px-3 py-1.5 text-center tabular">
                              {l.size}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th className="px-4 py-2 text-left label-caps">Qty</th>
                          {lines.map((l) => (
                            <td
                              key={l.id}
                              className="px-3 py-2 text-center tabular font-bold"
                            >
                              {l.quantity}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <footer className="border-t border-sand px-4 py-2 flex flex-wrap justify-between gap-2 text-xs text-graphite-ink">
                    <span className="tabular">
                      Indicative {amount(lead.unit_price)} per unit, ex-VAT
                    </span>
                    {lead.branding_placements?.length ? (
                      <span className="text-ink">
                        Logo: {lead.branding_placements.join(", ")}
                      </span>
                    ) : (
                      <span>No branding</span>
                    )}
                  </footer>
                </section>
              );
            })}
          </div>

          {quote.notes && (
            <section className="mt-8">
              <h2 className="label-caps mb-2">Notes from the buyer</h2>
              <p className="hairline bg-paper-raised px-4 py-3 text-sm whitespace-pre-wrap">
                {quote.notes}
              </p>
            </section>
          )}

          {/* Branding artwork (§8) */}
          {quote.has_branding && (
            <section className="mt-8">
              <h2 className="label-caps mb-2">Branding</h2>
              <div className="hairline bg-paper-raised px-4 py-4">
                {quote.logo_path ? (
                  <a
                    href={`/admin/artwork/${encodeURIComponent(quote.logo_path)}`}
                    className="inline-block bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150"
                  >
                    Download the artwork
                  </a>
                ) : (
                  <p className="text-sm text-graphite-ink">
                    No artwork was uploaded. The buyer wants branding — chase the
                    logo when you reply.
                  </p>
                )}

                {quote.logo_notes && (
                  <div className="mt-3">
                    <p className="label-caps mb-1">Artwork notes</p>
                    <p className="text-sm whitespace-pre-wrap">{quote.logo_notes}</p>
                  </div>
                )}

                <div className="mt-3">
                  <p className="label-caps mb-1">Placements</p>
                  <ul className="text-sm space-y-0.5">
                    {[...groups.entries()]
                      .filter(([, lines]) => lines[0].branding_placements?.length)
                      .map(([article, lines]) => (
                        <li key={article}>
                          <span className="tabular">{article}</span>{" "}
                          {lines[0].style_name} — {lines[0].branding_placements!.join(", ")}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <NotificationStatus quote={quote} />
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-6">
          <section className="hairline bg-paper-raised px-4 py-4">
            <h2 className="label-caps mb-3">Buyer</h2>
            <dl className="text-sm space-y-1.5">
              <Row label="Company" value={quote.company_name} />
              {quote.trn && <Row label="TRN" value={quote.trn} mono />}
              <Row label="Contact" value={quote.contact_name} />
              {quote.contact_role && <Row label="Role" value={quote.contact_role} />}
              <Row label="Email" value={quote.email} href={`mailto:${quote.email}`} />
              <Row
                label="Phone"
                value={quote.phone}
                mono
                href={`tel:${quote.phone.replace(/[^\d+]/g, "")}`}
              />
              <Row label="Deliver to" value={quote.delivery_emirate} />
              <Row
                label="Needed by"
                value={quote.required_by ? formatDate(quote.required_by) : "Not specified"}
              />
            </dl>

            <a
              href={`https://wa.me/${quote.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                `Hi ${quote.contact_name}, thanks for your quote request ${quote.reference}.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block text-center hairline px-3 py-2 text-sm hover:border-fairway transition-colors duration-150"
            >
              WhatsApp the buyer
            </a>
          </section>

          <section className="hairline bg-paper-raised px-4 py-4">
            <h2 className="label-caps mb-3">Totals</h2>
            <dl className="text-sm space-y-1.5">
              <Row label="Units" value={String(quote.total_units)} mono />
              <Row label="Lines" value={String(quote.lines.length)} mono />
              <Row label="Indicative" value={money(quote.indicative_value)} mono />
            </dl>
            <p className="mt-2 text-xs text-graphite-ink">
              Indicative, ex-VAT, before branding and delivery.
            </p>
          </section>

          <QuoteAdminControls
            id={quote.id}
            status={quote.status}
            quotedValue={quote.quoted_value}
            internalNotes={quote.internal_notes}
          />

          <a
            href={`/admin/quotes/${quote.id}/export`}
            className="block text-center hairline px-3 py-2 text-sm hover:border-fairway transition-colors duration-150"
          >
            Download lines as CSV
          </a>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-sand pb-1.5 last:border-0">
      <dt className="text-graphite-ink shrink-0">{label}</dt>
      <dd className={`text-right break-all ${mono ? "tabular" : ""}`}>
        {href ? (
          <a href={href} className="underline underline-offset-2 hover:text-fairway">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
