import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { all } from "@/lib/db";
import { writeWorkbook, type Cell } from "@/lib/xlsx/write";

/**
 * Download the entire stock position as an Excel workbook.
 *
 * The columns are the importer's own canonical headers, so the exported file
 * round-trips: the owner downloads it, corrects quantities in Excel, and
 * uploads the same file on the uploads tab with "Set quantities to this
 * file". Wholesale/cost prices are deliberately not included — this file
 * gets forwarded, and a spreadsheet travels further than a web page.
 */
export async function GET() {
  if (!(await getSession())) {
    return new NextResponse("Not signed in.", { status: 401 });
  }

  const rows = await all<{
    article_number: string;
    brand: string;
    style_name: string;
    colour: string;
    category: string;
    gender: string;
    condition: string;
    size: string;
    quantity: number;
    sku: string;
  }>(
    `SELECT p.article_number, p.brand, p.style_name, p.colour, p.category,
            p.gender, p.condition, v.size, v.quantity, v.sku
       FROM variants v JOIN products p ON p.id = v.product_id
      ORDER BY p.article_number ASC, v.size_order ASC`,
  );

  const sheet: Cell[][] = [
    [
      "Article Number",
      "Brand",
      "Description",
      "Colour",
      "Category",
      "Gender",
      "Condition",
      "Size",
      "Available",
      "SKU",
    ],
    ...rows.map((r): Cell[] => [
      r.article_number,
      r.brand,
      r.style_name,
      r.colour,
      r.category,
      r.gender,
      r.condition,
      r.size,
      r.quantity,
      r.sku,
    ]),
  ];

  const workbook = writeWorkbook("Stock", sheet);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pinhigh-stock-${date}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
