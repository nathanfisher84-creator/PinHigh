"use client";

import { useSyncExternalStore } from "react";

/**
 * The basket (spec §6.4).
 *
 * Persisted in localStorage under a versioned key and restored on return. The
 * pattern this exists for: a buyer builds a size run, sends the link to a
 * colleague for sign-off, and comes back days later expecting it intact.
 *
 * Two things follow from that and drive the design here:
 *   - Quantities against one colourway must survive switching to another
 *     (§6.3). The basket is keyed by SKU, never scoped to the page.
 *   - Nothing in here is authoritative. Prices and availability are re-checked
 *     server-side on the review page and again on submission (§7.2).
 */

const STORAGE_KEY = "pinhigh.basket.v1";

export interface BrandingSelection {
  placements: string[];
  notes?: string;
}

export interface CartLine {
  sku: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
  size: string;
  size_order: number;
  quantity: number;
  /** Indicative only. Re-read from the server before anything is submitted. */
  unit_price: number | null;
  category: string;
  branding?: BrandingSelection;
}

export interface CartState {
  lines: CartLine[];
  /** One logo reused across every branded line (§8). */
  logo?: { name: string; size: number; dataKey: string } | null;
  logoNotes?: string;
  updatedAt: string;
}

const EMPTY: CartState = { lines: [], logo: null, logoNotes: "", updatedAt: "" };

/* -------------------------------------------------------------------------
   Storage
   ---------------------------------------------------------------------- */

function read(): CartState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as CartState;
    if (!parsed || !Array.isArray(parsed.lines)) return EMPTY;
    // Drop anything malformed rather than rendering a broken line. A buyer
    // returning after a schema change should see a working basket, not a crash.
    const lines = parsed.lines.filter(
      (l): l is CartLine =>
        !!l &&
        typeof l.sku === "string" &&
        typeof l.quantity === "number" &&
        Number.isFinite(l.quantity) &&
        l.quantity > 0,
    );
    return { ...EMPTY, ...parsed, lines };
  } catch {
    return EMPTY;
  }
}

let state: CartState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function write(next: CartState) {
  state = { ...next, updatedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing or a full quota. The basket still works for this
      // session; silently degrading beats blocking the buyer.
    }
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  if (!hydrated) {
    hydrated = true;
    state = read();
    // Another tab editing the same basket — a buyer with the catalogue open
    // twice is common enough to be worth keeping in step.
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        state = read();
        emit();
      }
    });
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CartState {
  return state;
}

function getServerSnapshot(): CartState {
  return EMPTY;
}

/* -------------------------------------------------------------------------
   Mutations
   ---------------------------------------------------------------------- */

export interface SetQuantityInput {
  sku: string;
  quantity: number;
  /** Required when the line does not exist yet. */
  line?: Omit<CartLine, "quantity">;
}

export function setQuantity({ sku, quantity, line }: SetQuantityInput) {
  const current = state.lines;
  const index = current.findIndex((l) => l.sku === sku);
  const qty = Math.max(0, Math.floor(quantity));

  if (qty === 0) {
    if (index === -1) return;
    write({ ...state, lines: current.filter((l) => l.sku !== sku) });
    return;
  }

  if (index === -1) {
    if (!line) return;
    write({ ...state, lines: [...current, { ...line, quantity: qty }] });
    return;
  }

  const next = [...current];
  next[index] = { ...next[index], ...(line ?? {}), quantity: qty };
  write({ ...state, lines: next });
}

export function removeLine(sku: string) {
  write({ ...state, lines: state.lines.filter((l) => l.sku !== sku) });
}

/** Remove every line for one article number — clearing a whole size run. */
export function removeArticle(articleNumber: string) {
  write({
    ...state,
    lines: state.lines.filter((l) => l.article_number !== articleNumber),
  });
}

export function setLineBranding(sku: string, branding: BrandingSelection | undefined) {
  write({
    ...state,
    lines: state.lines.map((l) => (l.sku === sku ? { ...l, branding } : l)),
  });
}

/** Apply the same placements to every line of one article (§8: per line, but
 *  chosen per style in practice — a buyer brands the polo, not the polo in L). */
export function setArticleBranding(
  articleNumber: string,
  branding: BrandingSelection | undefined,
) {
  write({
    ...state,
    lines: state.lines.map((l) =>
      l.article_number === articleNumber ? { ...l, branding } : l,
    ),
  });
}

export function setLogo(logo: CartState["logo"], notes?: string) {
  write({ ...state, logo, logoNotes: notes ?? state.logoNotes });
}

export function clearCart() {
  write({ ...EMPTY });
}

/* -------------------------------------------------------------------------
   Selectors
   ---------------------------------------------------------------------- */

export interface CartTotals {
  units: number;
  lines: number;
  articles: number;
  /** Indicative only — never presented as a price (§7.1). */
  value: number;
  brandedLines: number;
  hasBranding: boolean;
}

export function totals(s: CartState): CartTotals {
  let units = 0;
  let value = 0;
  let brandedLines = 0;
  const articles = new Set<string>();

  for (const l of s.lines) {
    units += l.quantity;
    value += (l.unit_price ?? 0) * l.quantity;
    articles.add(l.article_number);
    if (l.branding?.placements.length) brandedLines++;
  }

  return {
    units,
    lines: s.lines.length,
    articles: articles.size,
    value: Math.round(value * 100) / 100,
    brandedLines,
    hasBranding: brandedLines > 0,
  };
}

/** Group lines into size runs, in canonical run order within each article. */
export function groupByArticle(s: CartState) {
  const groups = new Map<string, CartLine[]>();
  for (const line of s.lines) {
    const bucket = groups.get(line.article_number);
    if (bucket) bucket.push(line);
    else groups.set(line.article_number, [line]);
  }
  return [...groups.entries()].map(([article_number, lines]) => ({
    article_number,
    lines: [...lines].sort((a, b) => a.size_order - b.size_order),
    units: lines.reduce((n, l) => n + l.quantity, 0),
    value: lines.reduce((n, l) => n + (l.unit_price ?? 0) * l.quantity, 0),
  }));
}

/* -------------------------------------------------------------------------
   Hooks
   ---------------------------------------------------------------------- */

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCartTotals(): CartTotals {
  return totals(useCart());
}

/** Quantity for one SKU. Used by every cell in the size grid. */
export function useLineQuantity(sku: string): number {
  const cart = useCart();
  return cart.lines.find((l) => l.sku === sku)?.quantity ?? 0;
}
