import { StockSubNav } from "@/components/admin/StockSubNav";
import { listAdjustments, reasonLabel } from "@/lib/repo/stock";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stock adjustments" };

/**
 * The manual-adjustment ledger: who moved which size, from what to what, and
 * why. File uploads have their own history on the uploads tab — this page is
 * only the by-hand corrections.
 */
export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ article?: string }>;
}) {
  const params = await searchParams;
  const article = params.article?.trim() || undefined;
  const rows = listAdjustments(200, article);

  return (
    <div>
      <h1 className="text-2xl">Stock</h1>
      <StockSubNav />

      <p className="mt-6 max-w-2xl text-sm text-graphite-ink">
        Every manual correction, most recent first
        {article && (
          <>
            {" "}
            — filtered to <span className="tabular">{article}</span>
          </>
        )}
        . File uploads are recorded separately on the uploads tab.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 hairline bg-paper-raised px-4 py-8 text-center text-sm text-graphite-ink">
          No manual adjustments yet. Corrections made on the current-stock tab
          will appear here.
        </p>
      ) : (
        <div className="mt-6 scroll-x overflow-x-auto hairline bg-paper-raised">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Article</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Change</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-sand last:border-0">
                  <td className="tabular whitespace-nowrap px-3 py-2 text-graphite-ink">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="tabular px-3 py-2">{row.article_number}</td>
                  <td className="tabular px-3 py-2">{row.size}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                    {row.quantity_before} → {row.quantity_after}{" "}
                    <span className={row.delta < 0 ? "text-flag-ink" : "text-fairway"}>
                      ({row.delta > 0 ? "+" : ""}
                      {row.delta})
                    </span>
                  </td>
                  <td className="px-3 py-2">{reasonLabel(row.reason)}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-graphite-ink">
                    {row.note ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-graphite-ink">{row.actor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
