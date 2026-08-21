"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { saveStockAdjustment } from "@/app/admin/actions";
import type { StockArticle } from "@/lib/repo/stock";

/**
 * Adjusting stock by hand, size by size.
 *
 * The rule this interface is built around: nothing is written until the owner
 * says why. Neither adidas file records goods going *out*, so every correction
 * here is somebody's judgement about the real shelf, and a ledger of numbers
 * without reasons is unauditable six weeks later.
 *
 * Edits accumulate across articles and save in one go. Counting a rail means
 * touching a dozen sizes across several articles under the same reason —
 * saving each cell separately would be twelve confirmations for one stock take.
 */

const LOW_AT = 10;

interface Props {
  articles: StockArticle[];
  reasons: readonly { value: string; label: string; hint: string }[];
}

type Draft = Record<string, string>;

export function StockEditor({ articles, reasons }: Props) {
  const [draft, setDraft] = useState<Draft>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Only cells whose value actually differs from the stored figure count as
  // edits — typing 40 over 40 and tabbing away is not a change.
  const edits = useMemo(() => {
    const out: { variantId: string; quantity: number; label: string; from: number }[] = [];
    for (const article of articles) {
      for (const size of article.sizes) {
        const raw = draft[size.variant_id];
        if (raw === undefined) continue;
        if (raw.trim() === "") continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) continue;
        const quantity = Math.floor(value);
        if (quantity === size.quantity) continue;
        out.push({
          variantId: size.variant_id,
          quantity,
          from: size.quantity,
          label: `${article.article_number} ${size.size}`,
        });
      }
    }
    return out;
  }, [draft, articles]);

  const netUnits = edits.reduce((n, e) => n + (e.quantity - e.from), 0);

  const save = () => {
    setResult(null);
    startTransition(async () => {
      const res = await saveStockAdjustment(
        edits.map((e) => ({ variantId: e.variantId, quantity: e.quantity })),
        reason,
        note,
      );
      setResult(res);
      if (res.ok) {
        setDraft({});
        setNote("");
      }
    });
  };

  if (articles.length === 0) {
    return (
      <p className="hairline bg-paper-raised px-4 py-8 text-center text-sm text-graphite-ink">
        Nothing matches. Try a different search, or clear the filter.
      </p>
    );
  }

  return (
    <div className="pb-32">
      <div className="space-y-4">
        {articles.map((article) => (
          <article key={article.id} className="hairline bg-paper-raised">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-sand px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate">
                  <Link
                    href={`/admin/products?q=${encodeURIComponent(article.article_number)}`}
                    className="hover:text-fairway"
                  >
                    {article.style_name}
                  </Link>
                  {article.colour && (
                    <span className="text-graphite-ink"> · {article.colour}</span>
                  )}
                </h3>
                <p className="tabular mt-0.5 text-xs text-graphite-ink">
                  {article.article_number} · {article.category}
                  {!article.is_visible && " · hidden from the catalogue"}
                </p>
              </div>
              <p className="tabular shrink-0 text-sm">
                <span className="text-graphite-ink">Total </span>
                <span className="font-medium">{article.total}</span>
              </p>
            </header>

            {article.sizes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-graphite-ink">
                No sizes on file for this article yet.
              </p>
            ) : (
              <div className="scroll-x overflow-x-auto">
                <div className="flex min-w-max gap-2 px-4 py-3">
                  {article.sizes.map((size) => {
                    const raw = draft[size.variant_id];
                    const current = raw ?? String(size.quantity);
                    const changed =
                      raw !== undefined &&
                      raw.trim() !== "" &&
                      Number(raw) !== size.quantity;
                    const low = size.quantity > 0 && size.quantity < LOW_AT;

                    return (
                      <label
                        key={size.variant_id}
                        className="block w-[4.75rem] shrink-0 text-center"
                      >
                        <span className="tabular block text-2xs uppercase tracking-wider text-graphite-ink">
                          {size.size}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          value={current}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [size.variant_id]: e.target.value }))
                          }
                          aria-label={`${article.article_number} size ${size.size}, currently ${size.quantity}`}
                          className={[
                            "tabular mt-1 w-full border px-1.5 py-1.5 text-center text-sm",
                            "focus:outline-none focus:border-fairway focus:ring-1 focus:ring-fairway",
                            changed
                              ? "border-fairway bg-fairway-wash font-medium"
                              : size.quantity === 0
                                ? "border-sand bg-paper text-graphite-ink"
                                : low
                                  ? "border-flag bg-paper"
                                  : "border-sand bg-paper",
                          ].join(" ")}
                        />
                        {changed && (
                          <span className="tabular mt-0.5 block text-2xs text-graphite-ink">
                            was {size.quantity}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {/*
       * The save bar only appears once there is something to save, and it
       * carries the reason with it — the owner cannot write a change without
       * saying what it was, because the field lives in the same place as the
       * button.
       */}
      {edits.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-paper-raised shadow-[0_-2px_16px_rgba(20,24,26,0.08)]">
          <div className="mx-auto flex max-w-[100rem] flex-wrap items-end gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {edits.length} {edits.length === 1 ? "size" : "sizes"} changed
                <span className="tabular ml-2 font-normal text-graphite-ink">
                  {netUnits > 0 ? "+" : ""}
                  {netUnits} units
                </span>
              </p>
              <p className="tabular mt-0.5 truncate text-xs text-graphite-ink">
                {edits
                  .slice(0, 6)
                  .map((e) => `${e.label} ${e.from}→${e.quantity}`)
                  .join(", ")}
                {edits.length > 6 && ` and ${edits.length - 6} more`}
              </p>
            </div>

            <label className="block">
              <span className="block text-2xs uppercase tracking-wider text-graphite-ink">
                Reason
              </span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="hairline mt-1 bg-paper px-2 py-1.5 text-sm focus:outline-none focus:border-fairway"
              >
                <option value="">Choose…</option>
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.hint}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-[10rem] flex-1">
              <span className="block text-2xs uppercase tracking-wider text-graphite-ink">
                Note (optional)
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Counted with Ahmed, rail 3"
                className="hairline mt-1 w-full bg-paper px-2 py-1.5 text-sm focus:outline-none focus:border-fairway"
              />
            </label>

            <button
              type="button"
              onClick={() => setDraft({})}
              disabled={pending}
              className="hairline px-3 py-1.5 text-sm hover:border-flag hover:text-flag-ink disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !reason}
              className="bg-fairway px-5 py-2 text-sm text-paper transition-colors duration-150 hover:bg-ink disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>

          {!reason && (
            <p className="mx-auto max-w-[100rem] px-4 pb-2 text-xs text-graphite-ink sm:px-6">
              Pick a reason and these changes are recorded against it.
            </p>
          )}
        </div>
      )}

      {result && (
        <p
          role="status"
          className={[
            "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-sm shadow-lg",
            result.ok ? "bg-fairway text-paper" : "bg-flag text-paper",
          ].join(" ")}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
