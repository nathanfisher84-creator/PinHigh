/**
 * Buyer-facing catalogue visibility.
 *
 * Uncategorised adidas imports stay `is_visible` and `needs_review` (they
 * park in Accessories until the owner sets a category). The public listing,
 * PDP, exact-article search, and sitemap must treat `needs_review` as hidden.
 *
 * Uses a throwaway PGlite directory so this file cannot touch the app's
 * `.data` store. Seed runs the real adidas files through the real importer.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

process.env.PINHIGH_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pinhigh-vis-"));

const catalogue = await import("@/lib/repo/catalogue");
const db = await import("@/lib/db");
const sitemap = await import("@/app/sitemap");

const HIDDEN_ARTICLES = ["KS2292", "KT2806"];
const PUBLIC_ARTICLE = "HZ6891";

describe("needs_review is hidden from buyers", () => {
  before(async () => {
    // Force seed before assertions so a timeout is attributed to setup.
    await db.get("SELECT 1");
  });

  test("the seeded hoodie articles are the ones flagged for review", async () => {
    const flagged = await db.all<{ article_number: string; style_name: string }>(
      "SELECT article_number, style_name FROM products WHERE needs_review = 1 ORDER BY article_number",
    );
    assert.deepEqual(
      flagged.map((r) => r.article_number),
      HIDDEN_ARTICLES,
    );
    assert.ok(flagged.every((r) => r.style_name === "M Bu Driver Hd"));
  });

  test("listCatalogue never returns a needs_review card", async () => {
    const cards = await catalogue.listCatalogue();
    const articles = cards.flatMap((c) => c.colourways.map((cw) => cw.article_number));
    for (const article of HIDDEN_ARTICLES) {
      assert.equal(articles.includes(article), false, article);
    }
    assert.ok(articles.includes(PUBLIC_ARTICLE));
  });

  test("getProductByArticle 404s a needs_review article and serves a reviewed one", async () => {
    assert.equal(await catalogue.getProductByArticle(HIDDEN_ARTICLES[0]), null);
    const product = await catalogue.getProductByArticle(PUBLIC_ARTICLE);
    assert.ok(product);
    assert.equal(product.style_name, "Performance Textured Polo");
    assert.equal(product.colour, "White / Maroon");
  });

  test("findExactArticle does not jump to a needs_review article", async () => {
    assert.equal(await catalogue.findExactArticle(HIDDEN_ARTICLES[0]), null);
    assert.equal(await catalogue.findExactArticle(PUBLIC_ARTICLE), PUBLIC_ARTICLE);
  });

  test("the sitemap omits needs_review products", async () => {
    const entries = await sitemap.default();
    const urls = entries.map((e) => e.url);
    for (const article of HIDDEN_ARTICLES) {
      assert.equal(
        urls.some((u) => u.includes(`/product/${article}`)),
        false,
        article,
      );
    }
    assert.ok(urls.some((u) => u.includes(`/product/${PUBLIC_ARTICLE}`)));
  });

  test("toggling needs_review on a live article hides it until cleared", async () => {
    await db.run(
      "UPDATE products SET needs_review = 1 WHERE article_number = ?",
      PUBLIC_ARTICLE,
    );
    try {
      assert.equal(await catalogue.getProductByArticle(PUBLIC_ARTICLE), null);
      const cards = await catalogue.listCatalogue();
      assert.equal(
        cards.some((c) => c.colourways.some((cw) => cw.article_number === PUBLIC_ARTICLE)),
        false,
      );
    } finally {
      await db.run(
        "UPDATE products SET needs_review = 0 WHERE article_number = ?",
        PUBLIC_ARTICLE,
      );
    }
  });
});
