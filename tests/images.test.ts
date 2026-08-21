import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchImageFilenames, isCadDrawing, viewRank } from "@/lib/images/match";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";
import { isMeaningfulEntry } from "@/lib/zip";
import { defaultAltText } from "@/lib/images/process";

/**
 * Supplier image packs are messy: nested folders, mixed case, macOS cruft, and
 * article numbers that contain the very separators a naive parser would split
 * on. §5 promises this "works directly with supplier image packs", so these are
 * the shapes a real pack actually arrives in.
 */

const ARTICLES = ["41001", "41002", "41270", "ULT365-STRIPE-M", "00417", "HZ6891", "KS2292"];

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

  test("a separated suffix is read as an asset descriptor, not a new article", () => {
    /*
     * A deliberate trade-off, and worth stating.
     *
     * adidas names its photographs `HZ6891_Front.jpg` — article number, a
     * separator, then whatever their asset system produced. There is no way to
     * tell that apart from `41001-NAVY.jpg` by pattern alone, so one of the two
     * has to win.
     *
     * The adidas rule wins, because that is the format the client actually
     * receives, and because in adidas' numbering each colourway has its own
     * article number (HZ6891, HZ6892, ...) — colour is never a filename suffix.
     * The protection that remains is that the prefix must be a real article
     * number, and that a run-on with no separator is refused.
     */
    const r = matchImageFilenames(files("41001-NAVY.jpg"), ARTICLES);
    assert.equal(r.matched.length, 1);
    assert.equal(r.matched[0].article_number, "41001");
  });

  test("a longer article number wins over a shorter one that prefixes it", () => {
    const r = matchImageFilenames(files("41001-X_1.jpg"), [...ARTICLES, "41001-X"]);
    assert.equal(r.matched[0].article_number, "41001-X");
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

describe("adidas photo filenames", () => {
  // adidas ships assets whose first six characters are the article number and
  // whose suffix is whatever their system produced.
  test("first six characters identify the article", () => {
    const r = matchImageFilenames(files("HZ6891.jpg"), ARTICLES);
    assert.equal(r.matched[0].article_number, "HZ6891");
  });

  test("an adidas asset suffix still resolves", () => {
    for (const name of [
      "HZ6891_Front.jpg",
      "HZ6891_01_Standard.jpg",
      "HZ6891 (1).jpg",
      "HZ6891-detail.png",
      "HZ6891.Standard.jpg",
    ]) {
      const r = matchImageFilenames(files(name), ARTICLES);
      assert.equal(r.matched.length, 1, name);
      assert.equal(r.matched[0].article_number, "HZ6891", name);
    }
  });

  test("digits anywhere in the suffix order the photos", () => {
    const r = matchImageFilenames(
      files("HZ6891_03_Back.jpg", "HZ6891_01_Front.jpg", "HZ6891_02_Side.jpg"),
      ARTICLES,
    );
    assert.deepEqual(r.matched.map((m) => m.sequence), [1, 2, 3]);
  });

  test("running straight on into more characters is refused", () => {
    // "HZ68912" reads as a different article number, not HZ6891 photo 2.
    const r = matchImageFilenames(files("HZ68912.jpg"), ARTICLES);
    assert.equal(r.matched.length, 0);
    assert.equal(r.unmatched.length, 1);
  });

  test("a second adidas article in the same pack lands separately", () => {
    const r = matchImageFilenames(
      files("HZ6891_1.jpg", "KS2292_1.jpg", "KS2292_2.jpg"),
      ARTICLES,
    );
    assert.deepEqual(r.articlesCovered, ["HZ6891", "KS2292"]);
  });
});

describe("the adidas photo pack", () => {
  /*
   * The real pack: 164 files for 23 articles, named
   * `{ARTICLE}_{View}.jpeg`. Alongside each photograph adidas ship a CAD line
   * drawing as a numbered variant of a view, which must not reach a product
   * page — a flat technical illustration next to real photography reads as a
   * mistake.
   */
  const PACK = path.join(import.meta.dirname, "fixtures", "adidas-images.zip");
  const ARTICLES_IN_PACK = [
    "HZ6891", "HZ6892", "HZ6893", "HZ6894", "IQ2935", "IS7344", "IS7345",
    "IS7346", "IU4435", "IU4436", "IU4437", "IU4441", "IU4442", "IU4443",
    "IU4444", "IU4485", "IU4486", "JP0473", "JY5470", "JY5471", "KC1118",
    "KS2292", "KT2806",
  ];

  function matchPack() {
    const entries = readZip(readFileSync(PACK));
    return matchImageFilenames(
      [...entries.keys()].map((p) => ({ path: p })),
      ARTICLES_IN_PACK,
    );
  }

  test("a numbered view is a CAD drawing", () => {
    assert.equal(isCadDrawing("HZ6891_Standard View-1.jpeg"), true);
    assert.equal(isCadDrawing("IS7344_Back View-1.jpeg"), true);
    // The photographs are never numbered.
    assert.equal(isCadDrawing("HZ6891_Standard View.jpeg"), false);
    assert.equal(isCadDrawing("IU4485_F_Torso_B2CCat.jpeg"), false);
  });

  test("every CAD is left out and nothing else is", () => {
    const r = matchPack();
    assert.equal(r.skippedCad.length, 21);
    assert.ok(
      r.skippedCad.every((f) => /-\d+\.(jpe?g|png)$/i.test(f)),
      "only numbered variants are skipped",
    );
    assert.equal(
      r.matched.filter((m) => /-\d+\.(jpe?g|png)$/i.test(m.filename)).length,
      0,
      "no CAD reaches a product",
    );
  });

  test("the whole pack resolves with nothing left over", () => {
    const r = matchPack();
    assert.equal(r.matched.length, 143);
    assert.equal(r.unmatched.length, 0);
    assert.equal(r.articlesCovered.length, 23);
  });

  test("the ghost-mannequin shot leads each product", () => {
    // Standard View is the shot adidas uses as its own hero, so it takes the
    // card and the top of the product page.
    const r = matchPack();
    const first = r.matched
      .filter((m) => m.article_number === "HZ6891")
      .sort((a, b) => a.sequence - b.sequence)[0];
    assert.match(first.filename, /Standard View\.jpe?g$/i);
  });

  test("views fall in a sensible order behind it", () => {
    assert.ok(viewRank("Standard View") < viewRank("Front View"));
    assert.ok(viewRank("Front View") < viewRank("Back View"));
    assert.ok(viewRank("Back View") < viewRank("Side View"));
    // "Back Center View" also contains "back view" — the specific one wins.
    assert.ok(viewRank("Back Center View") > viewRank("Back View"));
  });

  test("a numeric suffix still orders where someone uses that convention", () => {
    const r = matchImageFilenames(
      files("41001_2.jpg", "41001_1.jpg"),
      ["41001"],
    );
    assert.deepEqual(r.matched.map((m) => m.sequence), [1, 2]);
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
