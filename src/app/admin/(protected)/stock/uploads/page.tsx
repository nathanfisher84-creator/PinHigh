import { StockImport } from "@/components/admin/StockImport";
import { ImportHistory } from "@/components/admin/ImportHistory";
import { listImports, canRollback, ROLLBACK_WINDOW_DAYS } from "@/lib/import/commit";
import { getStockAsAt } from "@/lib/repo/catalogue";
import { formatDateTime, relativeTime } from "@/lib/format";
import { StockSubNav } from "@/components/admin/StockSubNav";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stock uploads" };

/**
 * File-based stock updates (spec §4): the implementation file for details,
 * the invoice for quantities. Manual size-by-size corrections live one tab
 * over, on /admin/stock.
 */
export default function StockUploadsPage() {
  const imports = listImports(50);
  const stockDate = getStockAsAt();

  const history = imports.map((i) => ({
    ...i,
    rollbackable: canRollback(i),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl">Stock</h1>
        <p className="tabular text-sm text-graphite-ink">
          Last upload {relativeTime(stockDate)}
          {stockDate && ` · ${formatDateTime(stockDate)}`}
        </p>
      </div>

      <StockSubNav />

      <p className="mt-6 max-w-2xl text-sm text-graphite-ink">
        Upload your adidas files and you&apos;ll see exactly what changes before
        anything moves. Nothing is ever deleted — sizes that drop out of the file
        go to zero and come back when you include them again.
      </p>

      <div className="mt-8">
        <StockImport />
      </div>

      <section className="mt-14">
        <h2 className="text-xl">Upload history</h2>
        <p className="mt-1 text-sm text-graphite-ink">
          Any upload from the last {ROLLBACK_WINDOW_DAYS} days can be undone.
        </p>
        <div className="mt-4">
          <ImportHistory imports={history} />
        </div>
      </section>
    </div>
  );
}
