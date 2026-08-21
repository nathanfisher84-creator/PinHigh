import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readWorkbook, pickStockSheet, parseCsv } from "@/lib/xlsx/read";
import { matchHeaders, findHeaderRow, normaliseHeader } from "@/lib/import/columns";
import { splitArticleName, categoryFromName } from "@/lib/import/adidas-order";
import {
  parseStockSheet,
  parsePrice,
  parseQuantity,
  normaliseCategory,
  normaliseGender,
  normaliseCondition,
} from "@/lib/import/parse";

/**
 * The importer is where §15.5 says most of the risk sits: "The owner's current
 * Excel format is unknown. The importer's fuzzy matching should cope, but get a
 * real file early and test against it."
 *
 * These tests run against the actual supplied template, plus the deformations a
 * real owner's file is likely to have.
 */

const TEMPLATE = path.join(import.meta.dirname, "fixtures", "pinhigh-stock-template.xlsx");
const ADIDAS = path.join(import.meta.dirname, "fixtures", "adidas-delivery.xlsx");
const ADIDAS_ORDER = path.join(import.meta.dirname, "fixtures", "adidas-implementation.xlsx");

function loadTemplate() {
  const wb = readWorkbook(readFileSync(TEMPLATE), "pinhigh-stock-template.xlsx");
  return pickStockSheet(wb);
}

describe("reading the supplied template", () => {
  test("picks the Stock sheet, not the first one", () => {
    const wb = readWorkbook(readFileSync(TEMPLATE), "template.xlsx");
    assert.deepEqual(
      wb.sheets.map((s) => s.name),
      ["Stock", "How to use", "Lists"],
    );
    assert.equal(pickStockSheet(wb).name, "Stock");
  });

  test("reads every data row", () => {
    const sheet = loadTemplate();
    const dataRows = sheet.rows.slice(1).filter((r) => r[0]);
    assert.equal(dataRows.length, 311);
  });

  test("parses into SKUs with no failures", () => {
    const parsed = parseStockSheet(loadTemplate().rows);
    assert.equal(parsed.rows.length, 311);
    assert.equal(parsed.rowsFailed, 0);
    assert.equal(parsed.header.missingRequired.length, 0);
    assert.equal(
      parsed.issues.filter((i) => i.level === "error").length,
      0,
      "the canonical template must import clean",
    );
  });

  test("article numbers stay opaque strings", () => {
    const parsed = parseStockSheet(loadTemplate().rows);
    const articles = new Set(parsed.rows.map((r) => r.article_number));
    assert.equal(articles.size, 71);
    for (const row of parsed.rows) {
      assert.equal(typeof row.article_number, "string");
    }
  });

  test("totals match the source file", () => {
    const parsed = parseStockSheet(loadTemplate().rows);
    const units = parsed.rows.reduce((n, r) => n + r.quantity, 0);
    assert.equal(units, 12_975);
  });

  test("SKUs are unique and derived, not read from the file", () => {
    const parsed = parseStockSheet(loadTemplate().rows);
    const skus = new Set(parsed.rows.map((r) => r.sku));
    assert.equal(skus.size, parsed.rows.length);
    assert.ok(skus.has("41001-S"));
    assert.ok(skus.has("41270-8-5"), "half sizes slug correctly");
  });

  test("style groups collapse colourways", () => {
    const parsed = parseStockSheet(loadTemplate().rows);
    const groups = new Set(parsed.rows.map((r) => r.style_group).filter(Boolean));
    assert.equal(groups.size, 42);
  });

  test("pre-owned condition survives the parse", () => {
    const parsed = parseStockSheet(loadTemplate().rows);
    const preOwned = parsed.rows.filter((r) => r.condition === "pre-owned");
    assert.ok(preOwned.length > 0, "the template contains pre-owned stock");
  });
});

describe("the adidas delivery file", () => {
  /*
   * The real file the client receives. It is an SAP billing export, not a
   * stock list: sixty-odd accounting columns, of which four matter.
   */
  function loadAdidas() {
    const wb = readWorkbook(readFileSync(ADIDAS), "adidas-delivery.xlsx");
    return pickStockSheet(wb);
  }

  test("is detected by its own signature, not by fuzzy header matching", () => {
    const parsed = parseStockSheet(loadAdidas().rows);
    assert.equal(parsed.source, "adidas");
    assert.deepEqual(parsed.header.missingRequired, []);
  });

  test("an ordinary stock sheet is still read as the template", () => {
    const wb = readWorkbook(readFileSync(TEMPLATE), "template.xlsx");
    const parsed = parseStockSheet(pickStockSheet(wb).rows);
    assert.notEqual(parsed.source, "adidas");
  });

  test("Material becomes the article number and AFS Grid Value the size", () => {
    const parsed = parseStockSheet(loadAdidas().rows);
    const articles = [...new Set(parsed.rows.map((r) => r.article_number))];
    assert.deepEqual(articles, ["HZ6891", "HZ6892", "HZ6893", "HZ6894", "KS2292"]);
    assert.ok(articles.every((a) => a.length === 6), "adidas article numbers are six characters");

    const run = parsed.rows
      .filter((r) => r.article_number === "HZ6893")
      .sort((a, b) => a.size_order - b.size_order)
      .map((r) => r.size);
    assert.deepEqual(run, ["S", "M", "L", "XL", "2XL", "3XL", "4XL"]);
  });

  test("quantities read through SAP's three decimal places", () => {
    const parsed = parseStockSheet(loadAdidas().rows);
    const total = parsed.rows.reduce((n, r) => n + r.quantity, 0);
    assert.equal(total, 750);
    assert.equal(parsed.rowsFailed, 0);
  });

  test("the trailing totals row is skipped without an error", () => {
    // SAP appends a line with no Material and figures in the numeric columns.
    const parsed = parseStockSheet(loadAdidas().rows);
    assert.equal(parsed.rows.length, 35);
    assert.equal(parsed.issues.filter((i) => i.level === "error").length, 0);
  });

  test("cost is kept out of the public price", () => {
    /*
     * The single most damaging thing this importer could do is publish what
     * Pin High pays adidas as the price its own customers see.
     */
    const parsed = parseStockSheet(loadAdidas().rows);
    const row = parsed.rows.find((r) => r.article_number === "HZ6891")!;
    assert.equal(row.cost_price, 56.85, "unit cost is derived from Net value");
    assert.equal(row.rrp, 111.48, "RRP comes from the gross line value");
    assert.equal(row.price_wholesale, null, "the selling price is the owner's call");
  });

  test("articles arrive flagged for review, since the file has no names", () => {
    const parsed = parseStockSheet(loadAdidas().rows);
    assert.ok(parsed.rows.every((r) => r.needs_review));
    assert.ok(parsed.rows.every((r) => r.brand === "adidas"));
    // The article number stands in as the name until the owner renames it.
    assert.ok(parsed.rows.every((r) => r.style_name === r.article_number));
  });

  test("the invoice number is captured so a delivery cannot be counted twice", () => {
    const parsed = parseStockSheet(loadAdidas().rows);
    assert.deepEqual(parsed.billingDocuments, ["5101901080"]);
    assert.deepEqual(parsed.purchaseOrders, ["FW2026 2"]);
  });

  test("every SKU is unique and derived from article plus size", () => {
    const parsed = parseStockSheet(loadAdidas().rows);
    const skus = new Set(parsed.rows.map((r) => r.sku));
    assert.equal(skus.size, parsed.rows.length);
    assert.ok(skus.has("HZ6891-M"));
    assert.ok(skus.has("HZ6893-4XL"));
  });
});

describe("the adidas implementation file", () => {
  /*
   * The order book — every article bought for the season, with the product
   * detail the invoice does not carry. The two are joined by the sales order
   * number, which the invoice calls "Original Sales Order".
   */
  function load() {
    const wb = readWorkbook(readFileSync(ADIDAS_ORDER), "implementation.xlsx");
    return pickStockSheet(wb);
  }

  test("is detected apart from the invoice", () => {
    const parsed = parseStockSheet(load().rows);
    assert.equal(parsed.source, "adidas-order");

    const invoice = parseStockSheet(
      pickStockSheet(readWorkbook(readFileSync(ADIDAS), "invoice.xlsx")).rows,
    );
    assert.equal(invoice.source, "adidas");
  });

  test("carries far more than the invoice does", () => {
    const parsed = parseStockSheet(load().rows);
    const articles = new Set(parsed.rows.map((r) => r.article_number));
    // 23 articles in the template against the 5 the invoice shipped.
    assert.equal(articles.size, 23);
    assert.equal(parsed.rowsFailed, 0);
  });

  test("splits Article Name into a product name and a colourway", () => {
    // SAP writes these as two fixed-width fields run together.
    assert.deepEqual(splitArticleName("PERF TXT POLO       WHITE/MAROON"), {
      name: "Perf Txt Polo",
      colour: "White / Maroon",
    });
    assert.deepEqual(splitArticleName("ADI PERF H POLO     COLNAV"), {
      name: "Adi Perf H Polo",
      colour: "Colnav",
    });
    // A name with no colourway must not lose the name.
    assert.deepEqual(splitArticleName("SOME ITEM"), {
      name: "Some Item",
      colour: "",
    });
  });

  test("names, colours and fit come through", () => {
    const parsed = parseStockSheet(load().rows);
    const row = parsed.rows.find((r) => r.article_number === "HZ6891")!;
    assert.equal(row.style_name, "Perf Txt Polo");
    assert.equal(row.colour, "White / Maroon");
    assert.equal(row.gender, "mens");
    assert.equal(row.category, "polos");
    assert.equal(row.needs_review, false);
  });

  test("category is inferred from the name, never guessed", () => {
    assert.equal(categoryFromName("Perf Txt Polo"), "polos");
    assert.equal(categoryFromName("Ult365 Sld Polo"), "polos");
    // "M Bu Driver Hd" is not a vocabulary anyone can decode with confidence.
    assert.equal(categoryFromName("M Bu Driver Hd"), null);

    const parsed = parseStockSheet(load().rows);
    const flagged = [
      ...new Set(parsed.rows.filter((r) => r.needs_review).map((r) => r.article_number)),
    ];
    assert.deepEqual(flagged, ["KS2292", "KT2806"]);
  });

  test("no stock is taken from the template — that is the invoice's job", () => {
    /*
     * The load-bearing rule. This file is the product template; its quantity
     * columns are order-book positions, not what is on the shelf. Taking stock
     * from here would put units on the site that nobody can ship.
     */
    const parsed = parseStockSheet(load().rows);
    assert.equal(
      parsed.rows.reduce((n, r) => n + r.quantity, 0),
      0,
      "every row lands at zero",
    );
    assert.ok(parsed.rows.every((r) => r.quantity === 0));
  });

  test("a size appearing on two order lines becomes one SKU", () => {
    // HZ6893 has two 2XL rows, one delivered and one cancelled. The template
    // only cares that 2XL exists on the article.
    const parsed = parseStockSheet(load().rows);
    const twoXl = parsed.rows.filter(
      (r) => r.article_number === "HZ6893" && r.size === "2XL",
    );
    assert.equal(twoXl.length, 1);
  });

  test("it defines the full size run each article comes in", () => {
    const parsed = parseStockSheet(load().rows);
    const run = parsed.rows
      .filter((r) => r.article_number === "HZ6893")
      .sort((a, b) => a.size_order - b.size_order)
      .map((r) => r.size);
    assert.deepEqual(run, ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]);
  });

  test("a cancelled line does not import a price of zero", () => {
    // SAP writes an absent price as 0.00, which is not a price.
    const parsed = parseStockSheet(load().rows);
    const cancelled = parsed.rows.find((r) => r.article_number === "IS7344")!;
    assert.equal(cancelled.cost_price, null);
    assert.equal(cancelled.rrp, null);
  });

  test("cost stays out of the public price here too", () => {
    const parsed = parseStockSheet(load().rows);
    const row = parsed.rows.find((r) => r.article_number === "KS2292")!;
    assert.equal(row.cost_price, 102.57);
    assert.equal(row.rrp, 201.11);
    assert.equal(row.price_wholesale, null);
  });

  test("the sales order links the two files", () => {
    const order = parseStockSheet(load().rows);
    const invoice = parseStockSheet(
      pickStockSheet(readWorkbook(readFileSync(ADIDAS), "invoice.xlsx")).rows,
    );
    assert.deepEqual(order.orderNumbers, ["5052282932"]);
    // The invoice bills against the same order, which is how a double-count
    // is detected before it happens.
    assert.deepEqual(invoice.orderNumbers, ["5052282932"]);
  });
});

describe("header matching", () => {
  test("matches the template's own headers exactly", () => {
    const sheet = loadTemplate();
    const match = matchHeaders(sheet.rows[0]);
    assert.deepEqual(match.missingRequired, []);
    assert.equal(match.map.article_number, 0);
    assert.equal(match.map.quantity, 9);
  });

  test("the template says Corporate Price where the spec says Wholesale Price", () => {
    // Both must map to the same field, or prices silently vanish on import.
    assert.deepEqual(
      matchHeaders(["Article Number", "Corporate Price"]).map.price_wholesale,
      1,
    );
    assert.deepEqual(
      matchHeaders(["Article Number", "Wholesale Price"]).map.price_wholesale,
      1,
    );
  });

  test("matching ignores case, spaces, underscores and punctuation", () => {
    const match = matchHeaders([
      "article_no",
      "BRAND",
      "  Description  ",
      "Colour",
      "gender",
      "Category",
      "Size",
      "QTY",
    ]);
    assert.deepEqual(match.missingRequired, []);
    assert.equal(match.map.article_number, 0);
    assert.equal(match.map.quantity, 7);
  });

  test("common aliases resolve", () => {
    const match = matchHeaders([
      "Item Code",
      "Manufacturer",
      "Product Name",
      "Color",
      "Dept",
      "Product Type",
      "Size",
      "Stock On Hand",
      "Trade Price",
    ]);
    assert.deepEqual(match.missingRequired, []);
    assert.equal(match.map.price_wholesale, 8);
  });

  test("unrecognised columns are ignored, not fatal", () => {
    // §4.1: "Ignore unrecognised columns silently — the owner keeps working
    // notes on the sheet."
    const match = matchHeaders([
      "Article Number", "Brand", "Description", "Colour", "Gender",
      "Category", "Size", "Available",
      "Ali's notes", "REORDER??", "old price",
    ]);
    assert.deepEqual(match.missingRequired, []);
    assert.equal(match.unmatched.length, 3, "all three notes columns are ignored");
    assert.deepEqual(
      match.unmatched.map((u) => u.header),
      ["Ali's notes", "REORDER??", "old price"],
    );
  });

  test("a near-miss on an optional column is left alone rather than guessed", () => {
    // "old price" must not become the live wholesale price. Guessing an
    // optional column wrong is worse than leaving it blank, because a wrong
    // price is invisible until a buyer sees it.
    const match = matchHeaders([
      "Article Number", "Brand", "Description", "Colour", "Gender",
      "Category", "Size", "Available", "old price",
    ]);
    assert.equal(match.map.price_wholesale, undefined);
  });

  test("a genuinely unmappable required column is reported, not guessed", () => {
    const match = matchHeaders(["Widget", "Thing", "Doohickey"]);
    assert.ok(match.missingRequired.includes("article_number"));
    assert.ok(match.missingRequired.includes("quantity"));
  });

  test("finds a header row below title rows", () => {
    const rows = [
      ["Pin High stock — August"],
      [],
      ["Article Number", "Brand", "Description", "Colour", "Gender", "Category", "Size", "Available"],
      ["41001", "adidas", "Polo", "Navy", "Mens", "Polos", "M", "12"],
    ];
    assert.equal(findHeaderRow(rows), 2);
  });

  test("normaliseHeader strips bracketed units", () => {
    assert.equal(normaliseHeader("Wholesale Price (AED)"), "wholesaleprice");
    assert.equal(normaliseHeader("Qty (ex VAT)"), "qty");
  });
});

describe("value parsing", () => {
  test("quantities tolerate formatting", () => {
    assert.equal(parseQuantity("42"), 42);
    assert.equal(parseQuantity("1,250"), 1250);
    assert.equal(parseQuantity("12 units"), 12);
    assert.equal(parseQuantity("0"), 0);
    assert.equal(parseQuantity("12.0"), 12);
  });

  test("a negative on-hand figure clamps to zero rather than failing", () => {
    assert.equal(parseQuantity("-3"), 0);
  });

  test("a non-numeric quantity returns null so the row is reported", () => {
    // Silently importing 0 would zero a size run invisibly.
    assert.equal(parseQuantity("call to check"), null);
    assert.equal(parseQuantity(""), null);
  });

  test("prices tolerate currency and separators", () => {
    assert.equal(parsePrice("78"), 78);
    assert.equal(parsePrice("AED 78.50"), 78.5);
    assert.equal(parsePrice("1,250.50"), 1250.5);
    assert.equal(parsePrice(""), null, "blank retains the existing price");
  });

  test("categories normalise to the managed slug list", () => {
    assert.equal(normaliseCategory("Golf Bags"), "golf-bags");
    assert.equal(normaliseCategory("T-Shirts"), "t-shirts");
    assert.equal(normaliseCategory("polo shirts"), "polos");
    assert.equal(normaliseCategory("Footwear"), "shoes");
    assert.equal(normaliseCategory("Sprockets"), null);
  });

  test("genders normalise from the spellings an owner actually types", () => {
    assert.equal(normaliseGender("Mens"), "mens");
    assert.equal(normaliseGender("MEN"), "mens");
    assert.equal(normaliseGender("Women's"), "ladies");
    assert.equal(normaliseGender("Ladies"), "ladies");
    assert.equal(normaliseGender("Kids"), "junior");
    assert.equal(normaliseGender("banana"), null);
  });

  test("blank condition means new", () => {
    assert.equal(normaliseCondition(""), "new");
    assert.equal(normaliseCondition("Pre-owned"), "pre-owned");
    assert.equal(normaliseCondition("ex display"), "ex-display");
  });
});

describe("validation rules from §4.1", () => {
  const header = [
    "Article Number", "Brand", "Style Group", "Description", "Colour",
    "Gender", "Category", "Condition", "Size", "Available",
  ];

  test("the same article described two ways is an error, and the first wins", () => {
    const parsed = parseStockSheet([
      header,
      ["41001", "adidas", "G1", "Polo", "Navy", "Mens", "Polos", "New", "S", "5"],
      ["41001", "adidas", "G1", "Different Polo", "Red", "Mens", "Polos", "New", "M", "8"],
    ]);

    const error = parsed.issues.find((i) => i.level === "error");
    assert.ok(error, "the conflict is reported");
    assert.match(error!.message, /described two different ways/);
    assert.ok(error!.message.includes("Polo"), "both values are named");
    assert.deepEqual(error!.relatedRows, [2], "the first occurrence is cited");

    // Both rows still import, using the first occurrence's identity.
    assert.equal(parsed.rows.length, 2);
    assert.ok(parsed.rows.every((r) => r.style_name === "Polo"));
    assert.ok(parsed.rows.every((r) => r.colour === "Navy"));
  });

  test("a duplicated article and size has its quantities summed, with a warning", () => {
    const parsed = parseStockSheet([
      header,
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "M", "10"],
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "M", "5"],
    ]);

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].quantity, 15);
    const warning = parsed.issues.find((i) => i.level === "warning");
    assert.ok(warning);
    assert.match(warning!.message, /appears twice/);
  });

  test("a style group mixing genders warns but does not block", () => {
    const parsed = parseStockSheet([
      header,
      ["41001", "adidas", "MIX", "Polo", "Navy", "Mens", "Polos", "New", "M", "10"],
      ["41002", "adidas", "MIX", "Polo", "Pink", "Ladies", "Polos", "New", "M", "10"],
    ]);

    assert.equal(parsed.rows.length, 2, "both rows import");
    assert.equal(parsed.issues.filter((i) => i.level === "error").length, 0);
    const warning = parsed.issues.find((i) => i.message.includes("mixes"));
    assert.ok(warning);
  });

  test("a bad quantity fails only its own row", () => {
    const parsed = parseStockSheet([
      header,
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "S", "10"],
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "M", "ask Ali"],
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "L", "7"],
    ]);

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rowsFailed, 1);
    const error = parsed.issues.find((i) => i.level === "error");
    assert.equal(error?.rowNumber, 3, "the row number matches the spreadsheet");
  });

  test("blank spacing rows are skipped silently", () => {
    const parsed = parseStockSheet([
      header,
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "S", "10"],
      [],
      [null, null, null],
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "M", "10"],
    ]);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.issues.length, 0, "blank rows are not worth reporting");
  });

  test("a null style_group does not degrade anything", () => {
    // §3: "a null style_group must never degrade any function".
    const parsed = parseStockSheet([
      header,
      ["41001", "adidas", "", "Polo", "Navy", "Mens", "Polos", "New", "M", "10"],
    ]);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].style_group, null);
    assert.equal(parsed.rows[0].sku, "41001-M");
  });
});

describe("CSV", () => {
  test("parses quoted fields and embedded commas", () => {
    const rows = parseCsv('Article Number,Description\r\n41001,"Polo, striped"\r\n');
    assert.deepEqual(rows[1], ["41001", "Polo, striped"]);
  });

  test("handles a semicolon-delimited export from a European locale", () => {
    const rows = parseCsv("Article Number;Brand;Size\r\n41001;adidas;M\r\n");
    assert.deepEqual(rows[1], ["41001", "adidas", "M"]);
  });

  test("strips a UTF-8 BOM", () => {
    const rows = parseCsv("﻿Article Number,Brand\r\n41001,adidas\r\n");
    assert.equal(rows[0][0], "Article Number");
  });

  test("a CSV goes through the same parse path as a workbook", () => {
    const csv =
      "Article Number,Brand,Description,Colour,Gender,Category,Size,Available\n" +
      "41001,adidas,Polo,Navy,Mens,Polos,M,12\n";
    const parsed = parseStockSheet(parseCsv(csv));
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].quantity, 12);
  });
});

describe("refusals are explicit", () => {
  test("an old .xls file is refused with instructions, not half-read", () => {
    // OLE2 compound document magic — what Excel 97-2003 actually writes.
    const ole = Buffer.alloc(64);
    ole.writeUInt32LE(0xe011cfd0, 0);
    assert.throws(
      () => readWorkbook(ole, "stock.xls"),
      /Save As/,
      "the message tells the owner what to do",
    );
  });

  test("a file that is not a workbook is refused clearly", () => {
    assert.throws(
      () => readWorkbook(Buffer.from("not a spreadsheet"), "stock.xlsx"),
      /readable .xlsx workbook/,
    );
  });
});

describe("a bare stock report (article, size, quantity only)", () => {
  const rows = [
    ["Article", "Size", "Qty"],
    ["HZ6891", "M", "12"],
    ["HZ6891", "L", "0"],
    ["ZZ9999", "XL", "5"],
  ];

  test("three columns are enough — nothing required is missing", () => {
    const { missingRequired } = matchHeaders(rows[0]);
    assert.deepEqual(missingRequired, []);
  });

  test("quantities import; details are deferred to the catalogue", () => {
    const parsed = parseStockSheet(rows);
    assert.equal(parsed.rows.length, 3);
    assert.equal(parsed.rowsFailed, 0);

    const m = parsed.rows.find((r) => r.sku === "HZ6891-M");
    assert.ok(m);
    assert.equal(m.quantity, 12);
    // No name or colour in the file: the article number stands in and the
    // row is flagged so the commit never overwrites owner-entered details.
    assert.equal(m.style_name, "HZ6891");
    assert.equal(m.needs_review, true);
    assert.equal(m.gender, "unisex");
  });

  test("a sold-out size still imports as zero", () => {
    const parsed = parseStockSheet(rows);
    const l = parsed.rows.find((r) => r.sku === "HZ6891-L");
    assert.equal(l?.quantity, 0);
  });
});
