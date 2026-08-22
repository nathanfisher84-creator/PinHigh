import { NextResponse } from "next/server";
import { getQuoteByReference } from "@/lib/repo/quotes";
import { REFERENCE_PATTERN } from "@/lib/validation/quote";
import { writeWorkbook, type Cell } from "@/lib/xlsx/write";
import { formatDate } from "@/lib/format";
import { displayStyleName } from "@/lib/domain/display-name";

/**
 * The buyer's downloadable copy of their quote request.
 *
 * Same access model as the confirmation page itself: whoever holds the
 * reference can fetch it. Deliberately price-free — it is the buyer's copy,
 * and no price exists anywhere a buyer can see (§7.1). The sales team's
 * priced export lives behind the admin.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  const reference = decodeURIComponent(ref).toUpperCase();
  if (!REFERENCE_PATTERN.test(reference)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const quote = await getQuoteByReference(reference);
  if (!quote) return new NextResponse("Not found.", { status: 404 });

  const sheet: Cell[][] = [
    ["Pin High UAE — quote request"],
    [],
    ["Reference", quote.reference],
    ["Company", quote.company_name],
    ["Contact", quote.contact_name],
    ["Submitted", formatDate(quote.created_at)],
    ["Deliver to", quote.delivery_emirate],
    ["Needed by", quote.required_by ? formatDate(quote.required_by) : "Not specified"],
    ["Status", "Request received — nothing is charged or reserved until confirmed."],
    [],
    ["Article", "Item", "Colour", "Size", "Quantity", "Branding"],
    ...quote.lines.map((l): Cell[] => [
      l.article_number,
      `${l.brand} ${displayStyleName(l.style_name)}`.trim(),
      l.colour,
      l.size,
      l.quantity,
      l.branding_placements?.length ? l.branding_placements.join(", ") : "—",
    ]),
    [],
    ["Total units", quote.total_units],
  ];

  const workbook = writeWorkbook("Quote request", sheet);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${quote.reference}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
