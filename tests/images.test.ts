import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchImageFilenames } from "@/lib/images/match";
import { isMeaningfulEntry } from "@/lib/zip";
import { defaultAltText } from "@/lib/images/process";

/**
 * Supplier image packs are messy: nested folders, mixed case, macOS cruft, and
 * article numbers that contain the very separators a naive parser would split
 * on. §5 promises this "works directly with supplier image packs", so these are
 * the shapes a real pack actually arrives in.
 */

const ARTICLES = ["41001", "41002", "41270", "ULT365-STRIPE-M", "00417"];

const files = (...paths: string[]) => paths.map((path) => ({ path }));

describe("matching filenames to article numbers", () => {
  test("bare article number matches and sorts first", () => {
    const r = matchImageFilenames(files("41001.jpg"), ARTICLES);
    assert.equal(r.matched.length, 1);
    assert.equal(r.matched[0].article_number, "41001");
    assert.equal(r.matched[0].sequence, 0);
  });

  test("the documented pattern {article}_{n} matches in order", () => {
    const r = matchImageFilenames(
      files("41001_2.jpg", "41001_1.jpg", "41001_3.jpg"),
      ARTICLES,
    );
    assert.deepEqual(r.matched.map((m) => m.sequence), [1, 2, 3]);
    assert.ok(r.matched.every((m) => m.article_number === "41001"));
  });

  test("hyphen separators work too", () => {
    const r = matchImageFilenames(files("41002-1.png"), ARTICLES);
    assert.equal(r.matched[0].article_number, "41002");
    assert.equal(r.matched[0].sequence, 1);
  });

  test("nested folders are matched on the filename, not the path", () => {
    const r = matchImageFilenames(
      files("SS26 pack/polos/41001_1.jpg", "SS26 pack/shoes/41270_2.jpg"),
      ARTICLES,
    );
    assert.equal(r.matched.length, 2);
    assert.deepEqual(r.matched.map((m) => m.article_number).sort(), ["41001", "41270"]);
  });

  test("case and extension variations match", () => {
    const r = matchImageFilenames(files("41001_1.JPEG", "41270.PNG"), ARTICLES);
    assert.equal(r.matched.length, 2);
    assert.equal(r.unmatched.length, 0);
  });

  test("an article number containing hyphens is not split apart", () => {
    // The trap: a naive split on "-" would look for article "ULT365".
    const r = matchImageFilenames(
      files("ULT365-STRIPE-M_2.jpg", "ULT365-STRIPE-M.jpg"),
      ARTICLES,
    );
    assert.equal(r.matched.length, 2);
    assert.ok(r.matched.every((m) => m.article_number === "ULT365-STRIPE-M"));
    assert.deepEqual(r.matched.map((m) => m.sequence), [0, 2]);
  });

  test("leading zeros are preserved, not treated as a number", () => {
    const r = matchImageFilenames(files("00417_1.jpg"), ARTICLES);
    assert.equal(r.matched[0].article_number, "00417");
  });

  test("a colourway suffix is NOT filed under the base article", () => {
    // "41001-NAVY" is a different product. Guessing here would attach a navy
    // photograph to the white colourway, which is worse than not matching.
    const r = matchImageFilenames(files("41001-NAVY.jpg"), ARTICLES);
    assert.equal(r.matched.length, 0);
    assert.equal(r.unmatched.length, 1);
    assert.match(r.unmatched[0].reason, /No article number/);
  });

  test("an unknown article number is reported, not invented", () => {
    const r = matchImageFilenames(files("99999_1.jpg"), ARTICLES);
    assert.equal(r.matched.length, 0);
    assert.equal(r.unmatched[0].filename, "99999_1.jpg");
  });

  test("non-image files are reported separately", () => {
    const r = matchImageFilenames(files("pricelist.pdf", "notes.txt"), ARTICLES);
    assert.equal(r.matched.length, 0);
    assert.equal(r.unmatched.length, 2);
    assert.ok(r.unmatched.every((u) => u.reason === "Not an image file."));
  });

  test("articlesCovered lists what the pack actually illustrated", () => {
    const r = matchImageFilenames(
      files("41001_1.jpg", "41001_2.jpg", "41270.jpg"),
      ARTICLES,
    );
    assert.deepEqual(r.articlesCovered, ["41001", "41270"]);
  });
});

describe("zip housekeeping", () => {
  test("macOS and Windows cruft is filtered out", () => {
    // A pack zipped on a Mac is full of these; listing them as "unmatched"
    // would bury the files that genuinely need attention.
    for (const junk of [
      "__MACOSX/41001_1.jpg",
      "pack/__MACOSX/x.jpg",
      "pack/._41001_1.jpg",
      "Thumbs.db",
      "pack/.DS_Store",
      "pack/",
    ]) {
      assert.equal(isMeaningfulEntry(junk), false, junk);
    }
  });

  test("real files survive the filter", () => {
    for (const good of ["41001_1.jpg", "SS26/polos/41001_2.png"]) {
      assert.equal(isMeaningfulEntry(good), true, good);
    }
  });
});

describe("alt text", () => {
  test("follows the §5 shape", () => {
    assert.equal(
      defaultAltText("adidas", "Ultimate365 Stripe Golf Polo", "Flared / White"),
      "adidas Ultimate365 Stripe Golf Polo in Flared / White",
    );
  });
});
