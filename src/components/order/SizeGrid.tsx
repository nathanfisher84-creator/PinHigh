"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { setQuantity, useCart } from "@/lib/cart/store";
import { stockBarHeight, stockLevel } from "@/lib/domain/sizes";
import { PRICE_ON_REQUEST, units } from "@/lib/format";

/**
 * The size grid (spec §6.3) — the heart of the product page.
 *
 * §0 calls this "the screen that matters most": the signature element, the
 * thing buyers touch most, and the hardest to get right on mobile. The design
 * concept (§10) treats it as a precision instrument — mono numerals, hairline
 * rules, and an availability bar under each cell whose height maps to stock
 * depth, so the health of a whole size run reads in one glance before a single
 * number is read.
 *
 * The interaction rules that matter, and why:
 *   - Typing above available clamps and explains inline. Never a modal — a
 *     buyer keying a run of six sizes cannot be interrupted six times.
 *   - Arrow keys and Tab move between cells. Buyers key a full run fast, and
 *     a broken tab order is the first thing they will complain about.
 *   - case_pack rounds and says so; moq warns and never blocks. Minimums are
 *     the sales team's to negotiate (§6.3).
 */

export interface SizeGridVariant {
  sku: string;
  size: string;
  size_order: number;
  quantity: number;
}

export interface SizeGridProps {
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  category: string;
  variants: SizeGridVariant[];
  case_pack: number | null;
  moq: number | null;
}

export function SizeGrid({
  article_number,
  brand,
  style_name,
  colour,
  category,
  variants,
  case_pack,
  moq,
}: SizeGridProps) {
  const cart = useCart();
  const gridId = useId();
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const sorted = useMemo(
    () => [...variants].sort((a, b) => a.size_order - b.size_order),
    [variants],
  );

  const maxAvailable = useMemo(
    () => sorted.reduce((m, v) => Math.max(m, v.quantity), 0),
    [sorted],
  );

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart.lines) map.set(line.sku, line.quantity);
    return map;
  }, [cart.lines]);

  const styleUnits = sorted.reduce((n, v) => n + (quantities.get(v.sku) ?? 0), 0);

  const setNote = useCallback((sku: string, message: string | null) => {
    setNotes((prev) => {
      if (message === null) {
        if (!(sku in prev)) return prev;
        const next = { ...prev };
        delete next[sku];
        return next;
      }
      if (prev[sku] === message) return prev;
      return { ...prev, [sku]: message };
    });
  }, []);

  const commit = useCallback(
    (variant: SizeGridVariant, raw: number) => {
      let value = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
      const messages: string[] = [];

      // Clamp to what is actually there. Inline note, never a modal.
      if (value > variant.quantity) {
        value = variant.quantity;
        messages.push(`Only ${variant.quantity} in stock`);
      }

      // Case pack rounds to the nearest multiple and says so (§6.3).
      if (case_pack && case_pack > 1 && value > 0) {
        const rounded = Math.max(case_pack, Math.round(value / case_pack) * case_pack);
        const capped = Math.min(rounded, Math.floor(variant.quantity / case_pack) * case_pack);
        if (capped > 0 && capped !== value) {
          value = capped;
          messages.push(`Rounded to a multiple of ${case_pack}`);
        }
      }

      setNote(variant.sku, messages.length ? messages.join(" · ") : null);

      setQuantity({
        sku: variant.sku,
        quantity: value,
        line: {
          sku: variant.sku,
          article_number,
          brand,
          style_name,
          colour,
          size: variant.size,
          size_order: variant.size_order,
          category,
        },
      });
    },
    [article_number, brand, style_name, colour, category, case_pack, setNote],
  );

  /**
   * Keyboard movement across the run. Left/right walk sizes, up/down step the
   * quantity, Enter moves on. This is the fast path a buyer keying a full size
   * run actually uses.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number, variant: SizeGridVariant) => {
      const focusCell = (target: number) => {
        const el = inputsRef.current[target];
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
      };

      if (e.key === "ArrowRight") focusCell(index + 1);
      else if (e.key === "ArrowLeft") focusCell(index - 1);
      else if (e.key === "Enter") focusCell(index + 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = case_pack && case_pack > 1 ? case_pack : 1;
        const current = quantities.get(variant.sku) ?? 0;
        commit(variant, e.key === "ArrowUp" ? current + step : current - step);
      }
    },
    [commit, quantities, case_pack],
  );

  const belowMoq = moq !== null && styleUnits > 0 && styleUnits < moq;

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-graphite-ink">
        No sizes have been loaded for this article yet.
      </p>
    );
  }

  return (
    <section aria-labelledby={`${gridId}-heading`} className="mt-6">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h2 id={`${gridId}-heading`} className="label-caps">
          Size run
        </h2>
        <p className="label-caps" aria-hidden="true">
          Available beneath each size
        </p>
      </div>

      {/* Horizontal scroll with a sticky size header on mobile. Deliberately
          not collapsed to a stacked list — buyers need to see the run as a
          run (§6.3). */}
      <div className="scroll-x hairline bg-paper-raised">
        <table className="w-full border-collapse min-w-max">
          <caption className="sr-only">
            Quantities for {brand} {style_name} in {colour}, article {article_number}.
            Enter a quantity against each size. Use the left and right arrow keys to
            move between sizes, and the up and down arrow keys to change a quantity.
          </caption>

          <thead>
            <tr>
              {/* The corner cell labels the column of row headers below it, so
                  it is not itself a row or column header. */}
              <td className="sticky left-0 z-10 bg-paper-raised border-b border-r border-sand px-3 py-2 text-left label-caps w-20">
                Size
              </td>
              {sorted.map((v) => (
                <th
                  key={v.sku}
                  scope="col"
                  className="border-b border-r border-sand px-2 py-2 text-center min-w-[4.5rem]"
                >
                  <span className="tabular text-sm font-medium">{v.size}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Quantity row */}
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-paper-raised border-b border-r border-sand px-3 py-3 text-left label-caps"
              >
                Qty
              </th>
              {sorted.map((v, i) => {
                const value = quantities.get(v.sku) ?? 0;
                const soldOut = v.quantity <= 0;
                return (
                  <td
                    key={v.sku}
                    className="border-b border-r border-sand p-0 align-middle"
                    data-numeric
                  >
                    <label className="sr-only" htmlFor={`${gridId}-${v.sku}`}>
                      {style_name} in {colour}, size {v.size}.{" "}
                      {soldOut ? "Sold out." : `${v.quantity} available.`}
                    </label>
                    <input
                      id={`${gridId}-${v.sku}`}
                      ref={(el) => {
                        inputsRef.current[i] = el;
                      }}
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={0}
                      max={v.quantity}
                      disabled={soldOut}
                      value={value === 0 ? "" : value}
                      placeholder={soldOut ? "—" : "0"}
                      aria-describedby={notes[v.sku] ? `${gridId}-${v.sku}-note` : undefined}
                      aria-invalid={notes[v.sku] ? true : undefined}
                      onChange={(e) => commit(v, Number(e.target.value))}
                      onKeyDown={(e) => onKeyDown(e, i, v)}
                      onFocus={(e) => e.currentTarget.select()}
                      className={[
                        "w-full h-12 text-center bg-transparent text-base",
                        "focus:outline-none focus:bg-fairway-wash",
                        "disabled:bg-paper-sunken disabled:text-graphite disabled:cursor-not-allowed",
                        value > 0 ? "font-bold text-fairway" : "text-ink",
                      ].join(" ")}
                    />
                  </td>
                );
              })}
            </tr>

            {/* Availability row */}
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-paper-raised border-b border-r border-sand px-3 py-2 text-left label-caps"
              >
                Avail
              </th>
              {sorted.map((v) => {
                const level = stockLevel(v.quantity);
                return (
                  <td
                    key={v.sku}
                    className="border-b border-r border-sand px-2 py-2 text-center"
                    data-numeric
                  >
                    <span
                      className={[
                        "text-sm",
                        level === "out"
                          ? "text-graphite"
                          : level === "low"
                            ? "text-flag-ink font-medium"
                            : "text-ink",
                      ].join(" ")}
                    >
                      {v.quantity}
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* Depth bar — the glance-level read of the whole run (§10). */}
            <tr aria-hidden="true">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-paper-raised border-r border-sand px-3 py-2 text-left label-caps"
              >
                Depth
              </th>
              {sorted.map((v) => {
                const level = stockLevel(v.quantity);
                const height = stockBarHeight(v.quantity, maxAvailable);
                return (
                  <td key={v.sku} className="border-r border-sand px-2 pt-2 pb-3">
                    <span className="flex h-6 items-end justify-center">
                      {height === 0 ? (
                        <span className="block w-full h-px bg-sand" />
                      ) : (
                        <span
                          className={[
                            "block w-full",
                            level === "low" ? "bg-flag" : "bg-fairway",
                          ].join(" ")}
                          style={{ height: `${height}%` }}
                        />
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Inline notes. One line per affected size, below the grid rather than
          inside a cell, so the columns keep their width. */}
      {Object.entries(notes).length > 0 && (
        <ul className="mt-2 space-y-1" role="status" aria-live="polite">
          {Object.entries(notes).map(([sku, message]) => {
            const v = sorted.find((s) => s.sku === sku);
            return (
              <li
                key={sku}
                id={`${gridId}-${sku}-note`}
                className="text-xs text-flag-ink tabular"
              >
                Size {v?.size}: {message}
              </li>
            );
          })}
        </ul>
      )}

      {/* Live subtotal for this style (§6.3). */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rule pt-3">
        <p className="text-sm">
          {styleUnits === 0 ? (
            <span className="text-graphite-ink">No sizes selected for this colour yet.</span>
          ) : (
            <span className="tabular">
              <strong className="font-bold">{units(styleUnits)}</strong>
              <span className="text-graphite-ink"> in this colour</span>
            </span>
          )}
        </p>
        {styleUnits > 0 && (
          <p className="text-sm text-graphite-ink">{PRICE_ON_REQUEST}</p>
        )}
      </div>

      {/* MOQ warns, never blocks. A corporate buyer testing the water with six
          shirts is a lead, not an error (§6.3, §8). */}
      {belowMoq && (
        <p className="mt-2 text-xs text-graphite-ink" role="status">
          Most runs of this article start at {moq} units — we&apos;ll confirm what&apos;s
          possible on the quote.
        </p>
      )}

      {case_pack && case_pack > 1 && (
        <p className="mt-1 text-xs text-graphite-ink">
          Supplied in packs of {case_pack}.
        </p>
      )}
    </section>
  );
}
