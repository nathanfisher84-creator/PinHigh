import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getQuoteById } from "@/lib/repo/quotes";
import { quoteRequestWorkbook } from "@/lib/quotes/excel";

/** Excel (.xlsx) of one request's lines — required for the sales team. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) {
    return new NextResponse("Not signed in.", { status: 401 });
  }

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) return new NextResponse("Not found.", { status: 404 });

  const workbook = quoteRequestWorkbook(quote);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${quote.reference}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
