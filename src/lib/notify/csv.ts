import type { QuoteRequest, QuoteRequestWithLines } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";

/**
 * CSV export (spec §7.3, §9).
 *
 * Attached to every notification email and offered in the admin panel. The
 * sales team lives in Excel — a CSV of the lines is what actually gets used to
 * price a request, so the column order follows how a quote is built up rather
 * than the database's field order.
 */

/** Quote a CSV field, defending against formula injection in Excel. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // A cell starting with =, +, - or @ is executed as a formula when the file
  // is opened. These files are forwarded to customers, so prefix it out.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  // BOM so Excel opens UTF-8 correctly on a Windows machine, which is what the
  // sales team will be using.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function quoteLinesCsv(quote: QuoteRequestWithLines): string {
  return toCsv(
    [
      "Reference",
      "Company",
      "Contact",
      "Email",
      "Phone",
      "Deliver to",
      "Needed by",
      "Article Number",
      "SKU",
      "Brand",
      "Description",
      "Colour",
      "Size",
      "Quantity",
      "Retail RRP (AED)",
      "Retail line RRP (AED)",
      "Branding Placements",
      "Stock Note",
    ],
    quote.lines.map((l) => [
      quote.reference,
      quote.company_name,
      quote.contact_name,
      quote.email,
      quote.phone,
      quote.delivery_emirate,
      quote.required_by ? formatDate(quote.required_by) : "",
      l.article_number,
      l.sku,
      l.brand,
      l.style_name,
      l.colour,
      l.size,
      l.quantity,
      l.rrp ?? "",
      l.rrp === null ? "" : Math.round(l.rrp * l.quantity * 100) / 100,
      l.branding_placements?.join(" | ") ?? "",
      l.stock_flag ?? "",
    ]),
  );
}

/** Bulk export for a date range (§9). One row per request, not per line. */
export function quotesSummaryCsv(quotes: QuoteRequest[]): string {
  return toCsv(
    [
      "Reference",
      "Received",
      "Status",
      "Company",
      "TRN",
      "Contact",
      "Role",
      "Email",
      "Phone",
      "Deliver to",
      "Needed by",
      "Units",
      "Indicative Value (AED, ex-VAT)",
      "Quoted Value (AED)",
      "Branding",
      "Notes",
      "Internal Notes",
    ],
    quotes.map((q) => [
      q.reference,
      formatDate(q.created_at),
      q.status,
      q.company_name,
      q.trn ?? "",
      q.contact_name,
      q.contact_role ?? "",
      q.email,
      q.phone,
      q.delivery_emirate,
      q.required_by ? formatDate(q.required_by) : "",
      q.total_units,
      q.indicative_value,
      q.quoted_value ?? "",
      q.has_branding ? "Yes" : "No",
      q.notes ?? "",
      q.internal_notes ?? "",
    ]),
  );
}
