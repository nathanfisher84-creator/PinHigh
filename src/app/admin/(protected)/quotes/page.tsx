import Link from "next/link";
import { listQuotes } from "@/lib/repo/quotes";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/domain/types";
import { formatDate, hoursSince, money } from "@/lib/format";
import { StatusPill } from "@/components/admin/StatusPill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quote requests" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const statusParam = params.status;
  const statuses = (
    Array.isArray(statusParam) ? statusParam : statusParam ? [statusParam] : []
  ).filter((s): s is QuoteStatus => QUOTE_STATUSES.includes(s as QuoteStatus));

  const branded =
    params.branded === "1" ? true : params.branded === "0" ? false : undefined;

  const search = typeof params.q === "string" ? params.q : undefined;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const quotes = listQuotes({
    status: statuses.length ? statuses : undefined,
    branded,
    search,
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  });

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  for (const s of statuses) exportParams.append("status", s);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl">Quote requests</h1>
        <a
          href={`/admin/quotes/export?${exportParams.toString()}`}
          className="hairline px-4 py-2 text-sm hover:border-fairway transition-colors duration-150"
        >
          Export as CSV
        </a>
      </div>

      {/* Filters. A plain GET form so a filtered view can be bookmarked and
          pasted between the sales team. */}
      <form method="get" className="mt-6 hairline bg-paper-raised px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="label-caps block mb-1">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={search}
              placeholder="Reference, company, contact or email"
              className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
            />
          </div>

          <div>
            <label htmlFor="status" className="label-caps block mb-1">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statuses[0] ?? ""}
              className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
            >
              <option value="">Any</option>
              {QUOTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {QUOTE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="from" className="label-caps block mb-1">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              className="w-full hairline bg-paper px-3 py-2 text-sm tabular focus:outline-none focus:border-fairway"
            />
          </div>

          <div>
            <label htmlFor="to" className="label-caps block mb-1">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              className="w-full hairline bg-paper px-3 py-2 text-sm tabular focus:outline-none focus:border-fairway"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="branded"
              value="1"
              defaultChecked={branded === true}
              className="h-4 w-4 accent-[var(--color-fairway)]"
            />
            Branded only
          </label>

          <button
            type="submit"
            className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150"
          >
            Apply
          </button>
          <Link href="/admin/quotes" className="text-sm text-graphite-ink underline underline-offset-2">
            Clear
          </Link>
        </div>
      </form>

      <p className="tabular mt-4 text-sm text-graphite-ink">
        {quotes.length} {quotes.length === 1 ? "request" : "requests"}
      </p>

      {quotes.length === 0 ? (
        <p className="mt-4 hairline bg-paper-raised px-4 py-8 text-center text-sm text-graphite-ink">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="mt-4 hairline bg-paper-raised overflow-x-auto scroll-x">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="px-4 py-2 label-caps">Reference</th>
                <th className="px-4 py-2 label-caps">Received</th>
                <th className="px-4 py-2 label-caps">Company</th>
                <th className="px-4 py-2 label-caps">Contact</th>
                <th className="px-4 py-2 label-caps text-right">Units</th>
                <th className="px-4 py-2 label-caps text-right">Indicative</th>
                <th className="px-4 py-2 label-caps">Needed by</th>
                <th className="px-4 py-2 label-caps">Logo</th>
                <th className="px-4 py-2 label-caps">Status</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const waiting = q.status === "new" && hoursSince(q.created_at) > 24;
                return (
                  <tr
                    key={q.id}
                    className="border-b border-sand last:border-0 hover:bg-fairway-wash"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/quotes/${q.id}`}
                        className="tabular font-medium underline underline-offset-2"
                      >
                        {q.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-2 tabular whitespace-nowrap">
                      {formatDate(q.created_at)}
                      {waiting && (
                        <span className="tabular ml-2 text-xs text-flag-ink">
                          {Math.floor(hoursSince(q.created_at))}h
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{q.company_name}</td>
                    <td className="px-4 py-2">
                      {q.contact_name}
                      <span className="block text-xs text-graphite-ink">{q.email}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular">{q.total_units}</td>
                    <td className="px-4 py-2 text-right tabular">
                      {money(q.indicative_value)}
                    </td>
                    <td className="px-4 py-2 tabular whitespace-nowrap">
                      {q.required_by ? formatDate(q.required_by) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {q.has_branding ? (
                        <span className="text-fairway font-medium">Yes</span>
                      ) : (
                        <span className="text-graphite-ink">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={q.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
