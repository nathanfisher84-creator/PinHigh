import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  quoteRequestSchema,
  formatReference,
  REFERENCE_PATTERN,
  trnHint,
  trnLooksComplete,
} from "@/lib/validation/quote";
import { quoteLinesCsv } from "@/lib/notify/csv";
import { buildTemplateParameters } from "@/lib/notify/whatsapp";
import { quoteRequestWorkbook } from "@/lib/quotes/excel";
import { readWorkbook } from "@/lib/xlsx/read";
import type { QuoteRequestWithLines } from "@/lib/domain/types";

const validInput = {
  company_name: "Emirates Golf Events LLC",
  contact_name: "Sam Al Rashid",
  email: "sam@example.ae",
  phone: "501234567",
  phone_country: "+971",
  delivery_emirate: "Dubai",
  lines: [{ sku: "41001-M", article_number: "41001", size: "M", quantity: 24 }],
};

describe("quote validation", () => {
  test("accepts a complete request", () => {
    assert.equal(quoteRequestSchema.safeParse(validInput).success, true);
  });

  test("TRN is optional — many corporate buyers won't have it to hand", () => {
    // §7.2 is explicit that this "must not block them".
    assert.equal(quoteRequestSchema.safeParse({ ...validInput, trn: "" }).success, true);
    const { trn, ...withoutTrn } = { ...validInput, trn: undefined };
    assert.equal(quoteRequestSchema.safeParse(withoutTrn).success, true);
  });

  test("a partial TRN is accepted and hinted, never rejected", () => {
    assert.equal(
      quoteRequestSchema.safeParse({ ...validInput, trn: "1003" }).success,
      true,
    );
    assert.match(trnHint("1003")!, /15 digits/);
    assert.equal(trnHint("100312345678901"), null);
    assert.equal(trnLooksComplete("100312345678901"), true);
  });

  test("a request with no lines is rejected with an actionable message", () => {
    const result = quoteRequestSchema.safeParse({ ...validInput, lines: [] });
    assert.equal(result.success, false);
    assert.match(result.error!.issues[0].message, /Add at least one size/);
  });

  test("an unroutable email is rejected", () => {
    const result = quoteRequestSchema.safeParse({ ...validInput, email: "not-an-email" });
    assert.equal(result.success, false);
  });

  test("an emirate outside the UAE is rejected", () => {
    assert.equal(
      quoteRequestSchema.safeParse({ ...validInput, delivery_emirate: "London" }).success,
      false,
    );
  });

  test("the honeypot must be empty", () => {
    assert.equal(
      quoteRequestSchema.safeParse({ ...validInput, company_website: "http://spam" }).success,
      false,
    );
  });

  test("branding placements ride along per line", () => {
    const result = quoteRequestSchema.safeParse({
      ...validInput,
      lines: [
        {
          ...validInput.lines[0],
          branding: { placements: ["Left chest", "Sleeve"] },
        },
      ],
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.data!.lines[0].branding!.placements, ["Left chest", "Sleeve"]);
  });

  test("a small order is not rejected for being small", () => {
    // §6.3, §8: minimums warn, they never block. A buyer testing the water
    // with six shirts is a lead, not an error.
    const result = quoteRequestSchema.safeParse({
      ...validInput,
      lines: [{ ...validInput.lines[0], quantity: 1 }],
    });
    assert.equal(result.success, true);
  });
});

describe("quote references", () => {
  test("format is PH-Q-{year}-{4 digits}", () => {
    assert.equal(formatReference(2026, 417), "PH-Q-2026-0417");
    assert.equal(formatReference(2026, 1), "PH-Q-2026-0001");
    assert.match(formatReference(2026, 417), REFERENCE_PATTERN);
  });

  test("the pattern rejects anything else, so a bad URL never hits the database", () => {
    for (const bad of ["PH-Q-2026-417", "../../etc/passwd", "PH-2026-0417", ""]) {
      assert.equal(REFERENCE_PATTERN.test(bad), false, bad);
    }
  });
});

/* -------------------------------------------------------------------------
   Notifications
   ---------------------------------------------------------------------- */

const quote = {
  id: "abc",
  reference: "PH-Q-2026-0417",
  company_name: "Emirates Golf Events LLC",
  trn: null,
  contact_name: "Sam Al Rashid",
  contact_role: "Events Manager",
  email: "sam@example.ae",
  phone: "+971 501234567",
  delivery_emirate: "Dubai",
  required_by: "2026-10-14",
  notes: null,
  total_units: 48,
  indicative_value: 3744,
  has_branding: true,
  logo_path: null,
  logo_notes: null,
  status: "new",
  stock_applied: false,
  quoted_value: null,
  internal_notes: null,
  notified_email: [],
  notified_whatsapp: [],
  created_at: "2026-08-21T08:00:00.000Z",
  updated_at: "2026-08-21T08:00:00.000Z",
  lines: [
    {
      id: "l1",
      quote_request_id: "abc",
      sku: "41001-M",
      article_number: "41001",
      brand: "adidas",
      style_name: "Ultimate365 Stripe Golf Polo",
      colour: "Flared / White",
      size: "M",
      quantity: 24,
      unit_price: 78,
      line_total: 1872,
      rrp: 250,
      branding_placements: ["Left chest"],
      stock_flag: null,
    },
  ],
  logos: [],
} as unknown as QuoteRequestWithLines;

describe("CSV export", () => {
  test("includes a header row and one row per line", () => {
    const csv = quoteLinesCsv(quote);
    const rows = csv.trim().split("\r\n");
    assert.equal(rows.length, 2);
    assert.ok(rows[0].includes("Article Number"));
    assert.ok(rows[0].includes("Retail RRP (AED)"));
    assert.ok(!rows[0].toLowerCase().includes("wholesale"));
    assert.ok(rows[1].includes("41001"));
    assert.ok(rows[1].includes("250"));
  });

  test("neutralises formula injection", () => {
    // These files get forwarded to customers; a cell starting with = would
    // execute on open.
    const hostile = {
      ...quote,
      company_name: '=cmd|"/c calc"!A1',
    } as QuoteRequestWithLines;
    const csv = quoteLinesCsv(hostile);
    assert.ok(csv.includes("'=cmd"), "the formula is prefixed out");
    assert.ok(!/(^|,)=cmd/.test(csv));
  });

  test("quotes fields containing commas", () => {
    const csv = quoteLinesCsv(quote);
    assert.ok(csv.includes('"Flared / White"') || csv.includes("Flared / White"));
  });
});

describe("WhatsApp template parameters", () => {
  test("produces the seven parameters the template expects", () => {
    const params = buildTemplateParameters(quote);
    assert.equal(params.length, 7);
    assert.equal(params[0], "PH-Q-2026-0417");
    assert.equal(params[1], "Emirates Golf Events LLC");
    assert.equal(params[2], "48");
    assert.equal(params[3], "1");
    assert.equal(params[4], "3744.00");
  });

  test("branding resolves to yes or no", () => {
    // §7.3: whether a logo is attached changes who picks the request up, so it
    // belongs in the notification rather than one click deeper.
    assert.equal(buildTemplateParameters(quote)[5], "yes");
    assert.equal(
      buildTemplateParameters({ ...quote, has_branding: false })[5],
      "no",
    );
  });

  test("parameters never contain newlines or tabs", () => {
    // Meta rejects the whole message if they do, and the rejection is opaque.
    const messy = {
      ...quote,
      company_name: "Line one\nLine two\tTabbed",
    } as QuoteRequestWithLines;
    for (const param of buildTemplateParameters(messy)) {
      assert.ok(!/[\n\r\t]/.test(param), param);
    }
  });

  test("a missing date reads as 'not specified' rather than blank", () => {
    const params = buildTemplateParameters({ ...quote, required_by: null });
    assert.equal(params[6], "not specified");
  });
});

describe("Excel download of a quote request", () => {
  test("writes a real .xlsx with retail RRP, not wholesale", () => {
    const buf = quoteRequestWorkbook(quote);
    assert.equal(buf.readUInt32LE(0), 0x04034b50);
    const wb = readWorkbook(buf, "PH-Q-2026-0417.xlsx");
    const cells = wb.sheets[0].rows.flat().map(String);
    assert.ok(cells.some((c) => c.includes("Retail RRP")));
    assert.ok(cells.includes("250"));
    assert.ok(!cells.some((c) => /wholesale|cost from adidas/i.test(c)));
    assert.ok(cells.includes("PH-Q-2026-0417"));
  });
});
