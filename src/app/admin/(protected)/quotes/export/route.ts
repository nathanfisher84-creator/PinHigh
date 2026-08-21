import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listQuotes } from "@/lib/repo/quotes";
import { quotesSummaryCsv } from "@/lib/notify/csv";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/domain/types";

/** Bulk export for a date range (spec §9). */
export async function GET(request: Request) {
  if (!(await getSession())) {
    return new NextResponse("Not signed in.", { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const statuses = url.searchParams
    .getAll("status")
    .filter((s): s is QuoteStatus => QUOTE_STATUSES.includes(s as QuoteStatus));

  const quotes = await listQuotes({
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
    status: statuses.length ? statuses : undefined,
    limit: 5000,
  });

  const range = from || to ? `-${from ?? "start"}-to-${to ?? "now"}` : "";

  return new NextResponse((await quotesSummaryCsv(quotes)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pinhigh-quote-requests${range}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
