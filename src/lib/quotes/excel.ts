import type { QuoteRequestWithLines } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { writeWorkbook, type Cell } from "@/lib/xlsx/write";

/**
 * Admin Excel of one quote request.
 *
 * Retail RRP in AED is included and labelled as retail, not as the quote.
 * Wholesale / cost stay off this file — it gets forwarded.
 */

export function quoteRequestWorkbook(quote: QuoteRequestWithLines): Buffer {
  const rows: Cell[][] = [
    ["Pin High UAE — quote request"],
    ["Currency", "AED"],
    [],
    ["Reference", quote.reference],
    ["Status", quote.status],
    ["Company", quote.company_name],
    ["TRN", quote.trn],
    ["Contact", quote.contact_name],
    ["Role", quote.contact_role],
    ["Email", quote.email],
    ["Phone", quote.phone],
    ["Deliver to", quote.delivery_emirate],
    ["Needed by", quote.required_by ? formatDate(quote.required_by) : ""],
    ["Notes", quote.notes],
    ["Artwork notes", quote.logo_notes],
    ["Logos attached", quote.logos.length || (quote.logo_path ? 1 : 0)],
    ["Received", formatDate(quote.created_at)],
    [],
    [
      "Article Number",
      "SKU",
      "Brand",
      "Description",
      "Colour",
      "Size",
      "Quantity",
      "Retail RRP (AED)",
      "Retail line RRP (AED)",
      "Branding placements",
      "Stock note",
    ],
    ...quote.lines.map((l): Cell[] => [
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
    [],
    ["Total units", quote.total_units],
    [
      "Retail RRP total (AED)",
      quote.lines.reduce((n, l) => n + (l.rrp ?? 0) * l.quantity, 0),
    ],
    [],
    [
      "Retail RRP is the recommended retail price in AED. It is not the quote — we price quantity, branding and delivery separately.",
    ],
  ];

  return writeWorkbook(quote.reference, rows);
}
