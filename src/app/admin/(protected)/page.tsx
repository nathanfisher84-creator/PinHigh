import Link from "next/link";
import { getDashboardStats } from "@/lib/repo/quotes";
import { formatDateTime, hoursSince, money, relativeTime } from "@/lib/format";
import { QUOTE_STATUS_LABELS } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * Dashboard (spec §9).
 *
 * Ordered by what costs the business money if it is missed. An unanswered
 * corporate enquiry is a lost one, so anything sitting in `new` for more than
 * 24 hours is the first thing on the page, and a notification that never landed
 * is flagged loudly rather than left in a log.
 */
export default function AdminDashboard() {
  const stats = getDashboardStats();

  return (
    <div>
      <h1 className="text-2xl">Dashboard</h1>

      {/* Failures first — these are the ones that silently lose leads. */}
      {stats.failedNotifications.length > 0 && (
        <section className="mt-6 hairline border-flag bg-flag-wash px-4 py-4">
          <h2 className="font-medium text-flag-ink">
            {stats.failedNotifications.length}{" "}
            {stats.failedNotifications.length === 1 ? "request" : "requests"} had a
            notification fail
          </h2>
          <p className="mt-1 text-sm">
            These arrived but nobody was told. Open each one and use Resend
            notifications.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {stats.failedNotifications.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/admin/quotes/${q.id}`}
                  className="tabular underline underline-offset-2 hover:text-flag-ink"
                >
                  {q.reference}
                </Link>{" "}
                — {q.company_name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.stale.length > 0 && (
        <section className="mt-6 hairline border-flag bg-paper-raised px-4 py-4">
          <h2 className="font-medium">
            {stats.stale.length} {stats.stale.length === 1 ? "request has" : "requests have"}{" "}
            been waiting more than 24 hours
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {stats.stale.map((q) => (
              <li key={q.id} className="flex flex-wrap items-baseline gap-x-3">
                <Link
                  href={`/admin/quotes/${q.id}`}
                  className="tabular underline underline-offset-2 hover:text-fairway"
                >
                  {q.reference}
                </Link>
                <span>{q.company_name}</span>
                <span className="tabular text-flag-ink">
                  {Math.floor(hoursSince(q.created_at))}h
                </span>
                <span className="tabular text-graphite-ink">{q.total_units} units</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Numbers */}
      <div className="mt-8 grid gap-px bg-sand sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting a response"
          value={stats.awaitingResponse}
          href="/admin/quotes?status=new"
          emphasis={stats.awaitingResponse > 0}
        />
        <Stat label="Requests this week" value={stats.thisWeek} />
        <Stat label="Units requested this month" value={stats.unitsThisMonth} />
        <Stat
          label="Won vs quoted"
          value={
            stats.conversion === null
              ? "—"
              : `${Math.round(stats.conversion * 100)}%`
          }
          note={
            stats.conversion === null
              ? "Nothing quoted yet"
              : `${stats.wonCount} of ${stats.quotedCount}`
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Stock</h2>
          <p className="text-sm">
            Last upload{" "}
            <strong>{relativeTime(stats.lastImportAt)}</strong>
            {stats.lastImportAt && (
              <span className="text-graphite-ink">
                {" "}
                · {formatDateTime(stats.lastImportAt)}
              </span>
            )}
          </p>
          <p className="mt-2 text-sm">
            <span className="tabular font-medium">{stats.lowStock}</span>{" "}
            <span className="text-graphite-ink">
              sizes are down to single figures.
            </span>
          </p>
          <Link
            href="/admin/stock"
            className="mt-4 inline-block bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150"
          >
            Upload stock
          </Link>
        </section>

        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Quick links</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/admin/quotes" className="underline underline-offset-2 hover:text-fairway">
                All quote requests
              </Link>
            </li>
            <li>
              <Link href="/admin/products" className="underline underline-offset-2 hover:text-fairway">
                Products and images
              </Link>
            </li>
            <li>
              <Link href="/admin/recipients" className="underline underline-offset-2 hover:text-fairway">
                Who gets notified
              </Link>
            </li>
            <li>
              <Link href="/admin/settings" className="underline underline-offset-2 hover:text-fairway">
                Settings and announcement banner
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  note,
  emphasis,
}: {
  label: string;
  value: number | string;
  href?: string;
  note?: string;
  emphasis?: boolean;
}) {
  const body = (
    <div className="bg-paper-raised px-4 py-5 h-full">
      <p className="label-caps">{label}</p>
      <p
        className={[
          "tabular mt-2 text-3xl",
          emphasis ? "text-fairway font-bold" : "",
        ].join(" ")}
      >
        {typeof value === "number" ? value.toLocaleString("en-AE") : value}
      </p>
      {note && <p className="mt-1 text-xs text-graphite-ink">{note}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block hover:bg-fairway-wash transition-colors duration-150">
      {body}
    </Link>
  ) : (
    body
  );
}
