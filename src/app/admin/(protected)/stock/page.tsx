import Link from "next/link";
import { StockEditor } from "@/components/admin/StockEditor";
import { StockSubNav } from "@/components/admin/StockSubNav";
import {
  ADJUSTMENT_REASONS,
  getStockCounts,
  listStock,
  LOW_STOCK_AT,
} from "@/lib/repo/stock";
import { getStockAsAt } from "@/lib/repo/catalogue";
import { formatDateTime, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stock" };

/**
 * The live stock grid — every article, every size, editable in place.
 *
 * This exists because the adidas files only record deliveries in; nothing
 * ever decrements as goods sell. Corrections happen here, each one written to
 * the adjustment ledger with a reason.
 */
export default async function AdminStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const filter = params.filter === "low" || params.filter === "empty" ? params.filter : "";

  const counts = await getStockCounts();
  const articles = await listStock({
    search,
    lowOnly: filter === "low",
    emptyOnly: filter === "empty",
  });
  const stockDate = await getStockAsAt();

  const filterLink = (value: string, label: string, count?: number) => {
    const active = filter === value;
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (value && !active) qs.set("filter", value);
    const href = qs.size ? `/admin/stock?${qs.toString()}` : "/admin/stock";
    return (
      <Link
        key={value || "all"}
        href={href}
        aria-current={active ? "true" : undefined}
        className={[
          "hairline px-3 py-1.5 text-sm transition-colors duration-150",
          active ? "border-fairway bg-fairway-wash font-medium" : "hover:border-fairway",
        ].join(" ")}
      >
        {label}
        {count !== undefined && (
          <span className="tabular ml-1.5 text-graphite-ink">{count}</span>
        )}
      </Link>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl">Stock</h1>
        <div className="flex flex-wrap items-baseline gap-4">
          <p className="tabular text-sm text-graphite-ink">
            {counts.units} units across {counts.articles} articles · last upload{" "}
            {relativeTime(stockDate)}
            {stockDate && ` · ${formatDateTime(stockDate)}`}
          </p>
          {/* A plain link: the route streams the file with an attachment header. */}
          <a
            href="/admin/stock/export"
            download
            className="hairline bg-paper-raised px-3 py-1.5 text-sm hover:border-fairway"
          >
            Download all stock (Excel)
          </a>
        </div>
      </div>

      <StockSubNav />

      <p className="mt-6 max-w-2xl text-sm text-graphite-ink">
        Type over any figure to correct it — sold stock, a count, a write-off.
        Changes save together under one reason, and every change is kept in the{" "}
        <Link href="/admin/stock/history" className="link-underline">
          adjustment history
        </Link>
        . Sizes under {LOW_STOCK_AT} are outlined.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <form action="/admin/stock" className="flex">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <label className="sr-only" htmlFor="stock-search">
            Search articles
          </label>
          <input
            id="stock-search"
            name="q"
            defaultValue={search}
            placeholder="Article number, name or colour"
            className="hairline w-64 bg-paper-raised px-3 py-1.5 text-sm focus:outline-none focus:border-fairway"
          />
          <button
            type="submit"
            className="hairline -ml-px px-3 py-1.5 text-sm hover:border-fairway"
          >
            Search
          </button>
        </form>

        <span className="mx-1 hidden text-sand sm:inline" aria-hidden>
          |
        </span>

        {filterLink("", "All")}
        {filterLink("low", "Low sizes", counts.lowSizes)}
        {filterLink("empty", "Nothing left", counts.emptyArticles)}

        {(search || filter) && (
          <Link href="/admin/stock" className="text-sm text-graphite-ink link-underline">
            Clear
          </Link>
        )}
      </div>

      <div className="mt-6">
        <StockEditor articles={articles} reasons={ADJUSTMENT_REASONS} />
      </div>
    </div>
  );
}
