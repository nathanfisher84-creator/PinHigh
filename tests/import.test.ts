import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readWorkbook, pickStockSheet, parseCsv } from "@/lib/xlsx/read";
import { matchHeaders, findHeaderRow, normaliseHeader } from "@/lib/import/columns";
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

const TEMPLATE = path.join(import.meta.dirname, "..", "seed", "pinhigh-stock-template.xlsx");

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
