"use client";

import { useState, useTransition } from "react";
import { rollbackStockImport } from "@/app/admin/actions";
import { formatDateTime } from "@/lib/format";

interface ImportRow {
  id: string;
  filename: string;
  mode: string;
  rows_total: number;
  rows_created: number;
  rows_updated: number;
  rows_zeroed: number;
  rows_failed: number;
  status: string;
  created_at: string;
  rollbackable: boolean;
}

/**
 * Import history and one-click rollback (spec §4.2 step 6).
 *
 * Rollback asks for confirmation because it is itself a large, silent change to
 * the catalogue — the same reasoning that puts a REPLACE gate on a full import.
 */
export function ImportHistory({ imports }: { imports: ImportRow[] }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (imports.length === 0) {
    return (
      <p className="hairline bg-paper-raised px-4 py-6 text-sm text-graphite-ink">
        No uploads yet. Your first one will appear here.
      </p>
    );
  }

  return (
    <div>
      {message && (
        <p className="hairline bg-fairway-wash px-4 py-3 mb-4 text-sm" role="status">
          {message}
        </p>
      )}

      <div className="hairline bg-paper-raised overflow-x-auto scroll-x">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="px-4 py-2 label-caps">When</th>
              <th className="px-4 py-2 label-caps">File</th>
              <th className="px-4 py-2 label-caps">Mode</th>
              <th className="px-4 py-2 label-caps text-right">Updated</th>
              <th className="px-4 py-2 label-caps text-right">Added</th>
              <th className="px-4 py-2 label-caps text-right">Zeroed</th>
              <th className="px-4 py-2 label-caps text-right">Skipped</th>
              <th className="px-4 py-2 label-caps">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {imports.map((row) => (
              <tr key={row.id} className="border-b border-sand last:border-0">
                <td className="px-4 py-2 tabular whitespace-nowrap">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-4 py-2 max-w-[16rem] truncate" title={row.filename}>
                  {row.filename}
                </td>
                <td className="px-4 py-2">
                  {row.mode === "replace" ? (
                    <span className="text-flag-ink">Full replace</span>
                  ) : (
                    "Update"
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular">{row.rows_updated}</td>
                <td className="px-4 py-2 text-right tabular">{row.rows_created}</td>
                <td className="px-4 py-2 text-right tabular">{row.rows_zeroed}</td>
                <td className="px-4 py-2 text-right tabular">
                  {row.rows_failed > 0 ? (
                    <span className="text-flag-ink">{row.rows_failed}</span>
                  ) : (
                    row.rows_failed
                  )}
                </td>
                <td className="px-4 py-2">
                  {row.status === "rolled_back" ? (
                    <span className="text-graphite-ink">Rolled back</span>
                  ) : (
                    <span className="text-fairway">Applied</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {row.rollbackable &&
                    (confirming === row.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await rollbackStockImport(row.id);
                              setMessage(res.message);
                              setConfirming(null);
                            })
                          }
                          className="bg-flag px-3 py-1 text-xs text-paper hover:bg-flag-ink"
                        >
                          {pending ? "Undoing…" : "Yes, undo it"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="text-xs text-graphite-ink underline underline-offset-2"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(row.id)}
                        className="text-xs underline underline-offset-2 hover:text-flag-ink"
                      >
                        Undo this upload
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
