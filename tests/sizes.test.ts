import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sizeOrder,
  bySizeOrder,
  deriveSku,
  normaliseSize,
  stockLevel,
  stockBarHeight,
} from "@/lib/domain/sizes";

/**
 * Size ordering is the one piece of logic that, if wrong, makes the signature
 * screen of the whole site read as nonsense. §4.3: "never sort alphabetically".
 */

describe("size ordering", () => {
  test("lettered sizes sort on the canonical ladder, not alphabetically", () => {
    const sizes = ["XL", "S", "XXL", "M", "XS", "L"];
    const sorted = [...sizes].sort((a, b) => sizeOrder(a) - sizeOrder(b));
    assert.deepEqual(sorted, ["XS", "S", "M", "L", "XL", "XXL"]);
  });

  test("glove sizing puts ML between M and L", () => {
    const sorted = ["L", "ML", "S", "M", "XL"].sort((a, b) => sizeOrder(a) - sizeOrder(b));
    assert.deepEqual(sorted, ["S", "M", "ML", "L", "XL"]);
  });

  test("numeric sizes sort numerically, including half sizes", () => {
    // Shoe sizes from the real template. Alphabetically 10 sorts before 7.
    const sizes = ["9", "10.5", "7", "8.5", "12", "7.5", "11", "10"];
    const sorted = [...sizes].sort((a, b) => sizeOrder(a) - sizeOrder(b));
    assert.deepEqual(sorted, ["7", "7.5", "8.5", "9", "10", "10.5", "11", "12"]);
  });

  test("waist sizes sort numerically", () => {
    const sorted = ["40", "30", "36", "32", "38", "34"].sort(
      (a, b) => sizeOrder(a) - sizeOrder(b),
    );
    assert.deepEqual(sorted, ["30", "32", "34", "36", "38", "40"]);
  });

  test("lettered sizes come before numeric, and ONE sorts last", () => {
    const sorted = ["ONE", "32", "M", "XL", "9"].sort((a, b) => sizeOrder(a) - sizeOrder(b));
    assert.deepEqual(sorted, ["M", "XL", "9", "32", "ONE"]);
  });

  test("aliases land on the same rung as their canonical spelling", () => {
    assert.equal(sizeOrder("2XL"), sizeOrder("XXL"));
    assert.equal(sizeOrder("XXXL"), sizeOrder("3XL"));
    assert.equal(sizeOrder("large"), sizeOrder("L"));
  });

  test("one-size spellings all sort to the ONE band", () => {
    for (const spelling of ["ONE", "one size", "OS", "N/A", "Standard"]) {
      assert.equal(sizeOrder(spelling), sizeOrder("ONE"), spelling);
    }
  });

  test("junk input is deterministic and never throws", () => {
    // A single odd cell in a 10,000-row sheet must not fail the import.
    assert.equal(sizeOrder("¯\\_(ツ)_/¯"), sizeOrder("¯\\_(ツ)_/¯"));
    assert.ok(Number.isFinite(sizeOrder("")));
    assert.ok(Number.isFinite(sizeOrder(undefined as unknown as string)));
  });

  test("bySizeOrder sorts variant records", () => {
    const variants = [
      { size: "XL", size_order: sizeOrder("XL") },
      { size: "S", size_order: sizeOrder("S") },
      { size: "M", size_order: sizeOrder("M") },
    ];
    assert.deepEqual(variants.sort(bySizeOrder).map((v) => v.size), ["S", "M", "XL"]);
  });
});

describe("normaliseSize", () => {
  test("uppercases and trims", () => {
    assert.equal(normaliseSize("  m  "), "M");
    assert.equal(normaliseSize("size L"), "L");
  });

  test("keeps the decimal point in a half size", () => {
    assert.equal(normaliseSize("8.5"), "8.5");
  });
});

describe("deriveSku", () => {
  test("composes article number and size", () => {
    assert.equal(deriveSku("41001", "L"), "41001-L");
  });

  test("collapses non-alphanumerics to hyphens", () => {
    assert.equal(deriveSku("41001", "8.5"), "41001-8-5");
    assert.equal(deriveSku("ART 001", "one size"), "ART-001-ONE-SIZE");
  });

  test("preserves leading zeros — article numbers are opaque strings", () => {
    assert.equal(deriveSku("00417", "M"), "00417-M");
  });
});

describe("stock level", () => {
  test("zero is out, single figures are low", () => {
    assert.equal(stockLevel(0), "out");
    assert.equal(stockLevel(4), "low");
    assert.equal(stockLevel(9), "low");
    assert.equal(stockLevel(10), "medium");
  });

  test("the depth bar keeps a shallow size visible next to a deep one", () => {
    // A run of 4 against a max of 90 must still render, or the bar lies about
    // the size being unavailable.
    assert.ok(stockBarHeight(4, 90) >= 8);
    assert.equal(stockBarHeight(0, 90), 0);
    assert.equal(stockBarHeight(90, 90), 100);
  });
});
