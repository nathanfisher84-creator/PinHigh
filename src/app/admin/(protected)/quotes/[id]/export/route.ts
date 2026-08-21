import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getQuoteById } from "@/lib/repo/quotes";
import { quoteLinesCsv } from "@/lib/notify/csv";

/** CSV of one request's lines (spec §9). */
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

  return new NextResponse((await quoteLinesCsv(quote)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${quote.reference}-lines.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
