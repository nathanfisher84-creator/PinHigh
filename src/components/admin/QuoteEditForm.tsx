"use client";

import { useState, useTransition } from "react";
import { saveQuoteEdit } from "@/app/admin/actions";
import type { QuoteRequestWithLines } from "@/lib/domain/types";

/**
 * Staff edit of a request after the buyer sends it: quantities, notes,
 * artwork notes. Status is on the controls next to this.
 */
export function QuoteEditForm({ quote }: { quote: QuoteRequestWithLines }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(quote.lines.map((l) => [l.sku, l.quantity])),
  );

  if (quote.stock_applied) {
    return (
      <section className="hairline bg-paper-raised px-4 py-4">
        <h2 className="label-caps mb-2">Edit lines</h2>
        <p className="text-sm text-graphite-ink">
          Stock has already been taken for this request. Move it off Approved
          (or Won) if you need to change the lines — that puts the units back
          on the shelf first.
        </p>
      </section>
    );
  }

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <h2 className="label-caps mb-3">Edit this request</h2>
      <form
        action={(formData) => {
          formData.set(
            "lines",
            JSON.stringify(
              quote.lines.map((l) => ({ sku: l.sku, quantity: qtys[l.sku] ?? l.quantity })),
            ),
          );
          start(async () => {
            const res = await saveQuoteEdit(quote.id, formData);
            setOk(res.ok);
            setMessage(res.message);
          });
        }}
      >
        <div className="overflow-x-auto scroll-x">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-sand text-left">
                <th className="px-2 py-1.5 label-caps">SKU</th>
                <th className="px-2 py-1.5 label-caps">Item</th>
                <th className="px-2 py-1.5 label-caps">Size</th>
                <th className="px-2 py-1.5 label-caps text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-b border-sand last:border-0">
                  <td className="px-2 py-1.5 tabular">{l.sku}</td>
                  <td className="px-2 py-1.5">
                    {l.style_name}
                    <span className="block text-xs text-graphite-ink">{l.colour}</span>
                  </td>
                  <td className="px-2 py-1.5 tabular">{l.size}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      value={qtys[l.sku] ?? l.quantity}
                      onChange={(e) =>
                        setQtys((prev) => ({
                          ...prev,
                          [l.sku]: Number(e.target.value),
                        }))
                      }
                      className="w-20 hairline bg-paper px-2 py-1 text-right tabular focus:outline-none focus:border-fairway"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label htmlFor="edit-notes" className="label-caps mt-4 block mb-1">
          Notes from the buyer
        </label>
        <textarea
          id="edit-notes"
          name="notes"
          rows={3}
          defaultValue={quote.notes ?? ""}
          className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
        />

        <label htmlFor="edit-logo-notes" className="label-caps mt-4 block mb-1">
          Artwork notes
        </label>
        <textarea
          id="edit-logo-notes"
          name="logo_notes"
          rows={2}
          defaultValue={quote.logo_notes ?? ""}
          className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-3 w-full bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save lines and notes"}
        </button>
        {message && (
          <p className={`mt-2 text-xs ${ok ? "text-fairway" : "text-flag-ink"}`} role="status">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
