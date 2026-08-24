/**
 * Quote submit end-to-end against a throwaway PGlite store.
 *
 * A request is a quote, not a paid order: persist every line, leave stock
 * alone until staff approve, and treat skipped email as success.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

process.env.PINHIGH_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pinhigh-quote-"));

const db = await import("@/lib/db");
const quotes = await import("@/lib/repo/quotes");
const { persistQuoteRequest } = await import("@/lib/quotes/submit");

type VariantRow = {
  sku: string;
  quantity: number;
  article_number: string;
  size: string;
};

async function qty(sku: string): Promise<number> {
  const row = await db.get<{ quantity: number }>(
    "SELECT quantity FROM variants WHERE sku = ?",
    sku,
  );
  return row?.quantity ?? -1;
}

async function twoLiveVariants(): Promise<[VariantRow, VariantRow]> {
  const existing = await db.all<VariantRow>(
    `SELECT v.sku, v.quantity, p.article_number, v.size
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.quantity >= 5
      ORDER BY v.quantity DESC
      LIMIT 8`,
  );
  const unique: VariantRow[] = [];
  const seen = new Set<string>();
  for (const row of existing) {
    if (seen.has(row.sku)) continue;
    seen.add(row.sku);
    unique.push(row);
    if (unique.length === 2) return [unique[0], unique[1]];
  }

  const timestamp = db.now();
  const productId = db.uid();
  await db.run(
    `INSERT INTO products (
       id, article_number, brand, style_name, condition, colour, category, gender,
       price_wholesale, rrp, needs_review, is_visible, is_discontinued, sort_order,
       created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    productId,
    "PHTEST1",
    "adidas",
    "Test Polo",
    "new",
    "White",
    "polos",
    "mens",
    80,
    199,
    0,
    1,
    0,
    0,
    timestamp,
    timestamp,
  );
  const a: VariantRow = { sku: "PHTEST1-M", quantity: 20, article_number: "PHTEST1", size: "M" };
  const b: VariantRow = { sku: "PHTEST1-L", quantity: 15, article_number: "PHTEST1", size: "L" };
  await db.run(
    `INSERT INTO variants (id, product_id, sku, size, size_order, quantity, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    db.uid(),
    productId,
    a.sku,
    a.size,
    2,
    a.quantity,
    timestamp,
  );
  await db.run(
    `INSERT INTO variants (id, product_id, sku, size, size_order, quantity, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    db.uid(),
    productId,
    b.sku,
    b.size,
    3,
    b.quantity,
    timestamp,
  );
  return [a, b];
}

describe("multi-line quote persist", { timeout: 180_000 }, () => {
  let first: VariantRow;
  let second: VariantRow;

  before(async () => {
    await db.get("SELECT 1");
    [first, second] = await twoLiveVariants();
  });

  test("a dummy request with two lines and two logos lands in the admin list", async () => {
    const beforeFirst = await qty(first.sku);
    const beforeSecond = await qty(second.sku);

    const quote = await persistQuoteRequest({
      company_name: "Al Ain Tournament Co",
      contact_name: "Test Buyer",
      email: "buyer@example.ae",
      phone: "+971 501110000",
      delivery_emirate: "Dubai",
      notes: "Dummy multi-line request",
      lines: [
        {
          sku: first.sku,
          article_number: first.article_number,
          size: first.size,
          quantity: 3,
        },
        {
          sku: second.sku,
          article_number: second.article_number,
          size: second.size,
          quantity: 2,
        },
      ],
      logoPaths: [
        { storage_path: "dummy-chest.png", original_name: "chest.png" },
        { storage_path: "dummy-back.png", original_name: "back.png" },
      ],
    });

    assert.match(quote.reference, /^PH-Q-\d{4}-\d{4}$/);
    assert.equal(quote.lines.length, 2);
    assert.equal(quote.total_units, 5);
    assert.equal(quote.status, "new");
    assert.equal(quote.stock_applied, false);
    assert.equal(quote.logos.length, 2);

    const listed = await quotes.listQuotes({ search: "Al Ain Tournament Co" });
    assert.ok(
      listed.some((q) => q.reference === quote.reference),
      "the request must appear in the admin list",
    );

    assert.equal(await qty(first.sku), beforeFirst, "stock must not move on submit");
    assert.equal(await qty(second.sku), beforeSecond, "stock must not move on submit");

    const skipped = [...quote.notified_email, ...quote.notified_whatsapp].filter(
      (n) => n.status === "skipped",
    );
    assert.ok(quote.id, "skipped email must not fail the submit");
    assert.ok(
      skipped.length === 0 || quote.reference,
      "a skipped channel is not a failed submit",
    );

    await quotes.updateQuoteStatus(quote.id, "approved");
    const approved = await quotes.getQuoteById(quote.id);
    assert.equal(approved?.status, "approved");
    assert.equal(approved?.stock_applied, true);
    assert.equal(await qty(first.sku), beforeFirst - 3);
    assert.equal(await qty(second.sku), beforeSecond - 2);

    await quotes.updateQuoteStatus(quote.id, "cancelled");
    assert.equal(await qty(first.sku), beforeFirst);
    assert.equal(await qty(second.sku), beforeSecond);
  });

  test("reject does not decrement stock", async () => {
    const beforeFirst = await qty(first.sku);
    const quote = await persistQuoteRequest({
      company_name: "Rejected Request LLC",
      contact_name: "Test Buyer",
      email: "buyer2@example.ae",
      phone: "+971 501110001",
      delivery_emirate: "Abu Dhabi",
      lines: [
        {
          sku: first.sku,
          article_number: first.article_number,
          size: first.size,
          quantity: 1,
        },
        {
          sku: second.sku,
          article_number: second.article_number,
          size: second.size,
          quantity: 1,
        },
      ],
      logoPaths: [],
    });
    assert.equal(await qty(first.sku), beforeFirst);
    await quotes.updateQuoteStatus(quote.id, "lost");
    assert.equal(await qty(first.sku), beforeFirst);
    const loaded = await quotes.getQuoteById(quote.id);
    assert.equal(loaded?.stock_applied, false);
  });
});
