/**
 * Client-feedback invariants that do not need a live catalogue:
 * official adidas copy is never invented, and the stock date stays off
 * public pages.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEEDED_ARTICLES,
  allAttemptedAdidasUrls,
  hasOfficialCopy,
  officialCopy,
} from "@/lib/domain/adidas-copy";

const INVENTED = [
  "climalite",
  "aeroready",
  "stay dry",
  "moisture-wicking",
  "engineered for performance",
  "premium comfort",
];

describe("adidas.ae official copy", () => {
  test("seeded articles are mapped and none are marked retrieved", () => {
    assert.ok(SEEDED_ARTICLES.includes("HZ6893"));
    for (const article of SEEDED_ARTICLES) {
      const copy = officialCopy(article);
      assert.equal(copy.retrieved, false, article);
      assert.equal(hasOfficialCopy(copy), false, article);
      assert.equal(copy.material, null, article);
      assert.equal(copy.description, null, article);
      assert.equal(copy.features.length, 0, article);
      assert.equal(copy.benefits.length, 0, article);
      assert.ok(copy.attempted_urls.some((u) => u.includes("adidas.ae")));
    }
  });

  test("missing copy is empty, never fabricated marketing text", () => {
    const copy = officialCopy("HZ6893");
    const blob = JSON.stringify(copy).toLowerCase();
    for (const slogan of INVENTED) {
      assert.equal(blob.includes(slogan), false, slogan);
    }
    const unknown = officialCopy("NO-SUCH-SKU");
    assert.equal(hasOfficialCopy(unknown), false);
    assert.equal(unknown.retrieved, false);
  });

  test("the URL list we actually requested is recorded", () => {
    const urls = allAttemptedAdidasUrls();
    assert.ok(urls.some((u) => u.includes("/en/hz6893.html")));
    assert.ok(urls.every((u) => u.startsWith("https://www.adidas.ae/")));
  });
});

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx|mdx)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("stock date is admin-only", () => {
  test("public app and components never render “Stock as at”", () => {
    const roots = [
      path.join(process.cwd(), "src/app"),
      path.join(process.cwd(), "src/components"),
    ];
    const files = roots.flatMap((root) => walk(root)).filter((file) => {
      const rel = file.replace(process.cwd() + path.sep, "");
      return !rel.includes(`${path.sep}admin${path.sep}`) && !rel.includes("/admin/");
    });
    assert.ok(files.length > 10, "expected to scan public source files");
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(
        text.includes("Stock as at"),
        false,
        `${file} still shows the stock date to buyers`,
      );
      assert.equal(
        /\bstockAsAt\b/.test(text),
        false,
        `${file} still calls stockAsAt on a public surface`,
      );
    }
  });
});
