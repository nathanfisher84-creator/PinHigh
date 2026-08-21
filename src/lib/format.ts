/**
 * Formatting helpers.
 *
 * Currency is AED and every catalogue figure is ex-VAT and indicative (§7.1,
 * §11). The label that says so is not optional decoration — it is the thing
 * that keeps the site a quote platform rather than a shop, so it lives here
 * next to the number rather than being left to each caller to remember.
 */

export const CURRENCY = "AED";
export const VAT_RATE = 0.05;

const AED = new Intl.NumberFormat("en-AE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const AED_EXACT = new Intl.NumberFormat("en-AE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "AED 1,250" — no decimals when they are all zero, which is the common case. */
export function money(value: number | null | undefined, opts?: { exact?: boolean }): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${CURRENCY} ${(opts?.exact ? AED_EXACT : AED).format(value)}`;
}

/** Bare number, for a column that already carries its currency in the header. */
export function amount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return AED.format(value);
}

export function units(n: number): string {
  return `${n.toLocaleString("en-AE")} ${n === 1 ? "unit" : "units"}`;
}

/**
 * Pricing is not shown on the public site.
 *
 * Corporate pricing depends on quantity, branding and delivery, and a figure
 * on a product page invites a buyer to anchor on it before any of that is
 * known — which the sales team then has to argue back from. Every public
 * surface says this instead, and the real numbers live in the admin panel and
 * in the quote the team sends.
 *
 * `money()` and `amount()` are still used by the admin and by the notification
 * the sales team receives. They must not reach a public page.
 */
export const PRICE_ON_REQUEST = "Price on request";
export const PRICE_NOTE =
  "We price each request on its own — quantity, branding and delivery together.";

/** Retained for the admin and the internal notification only. */
export const PRICE_CAVEAT = "Indicative — excl. VAT, branding and delivery";
export const PRICE_CAVEAT_SHORT = "Indicative · excl. VAT";

/* -------------------------------------------------------------------------
   Dates
   ---------------------------------------------------------------------- */

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dubai",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Dubai",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

/**
 * "Stock as at 18 Aug 2026" (§7.1).
 *
 * The upload is periodic, so presenting stock as live would be a lie the sales
 * team has to apologise for. When there has never been an import, say that
 * plainly rather than showing a date that implies freshness.
 */
export function stockAsAt(iso: string | null | undefined): string {
  if (!iso) return "Stock not yet uploaded";
  return `Stock as at ${formatDate(iso)}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatDate(iso);
}

/** Hours a request has been sitting unanswered — drives the §9 dashboard flag. */
export function hoursSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (Date.now() - then) / 3_600_000;
}

/* -------------------------------------------------------------------------
   Text
   ---------------------------------------------------------------------- */

export function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** "polos" -> "Polos", "golf-bags" -> "Golf Bags". */
export function slugToLabel(slug: string): string {
  return slug.split("-").map((w) => titleCase(w)).join(" ");
}

export function pluralise(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}
