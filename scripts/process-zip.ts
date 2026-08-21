/**
 * One-off: turn the supplier photo zip into seed images with every angle.
 * Run: node --import ./tests/alias-hook.mjs <this file> <zip path>
 *
 * Output: public/seed-images/{ARTICLE}-{n}-800.webp, n in view order
 * (Standard View first), CAD drawings skipped — the same rules as the
 * admin upload path, because it reuses the same matcher.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";
import { matchImageFilenames } from "@/lib/images/match";
import sharp from "sharp";

const zipPath = process.argv[2];
if (!zipPath) throw new Error("usage: process-zip <zip>");

// Known articles from the seed template parse — read from the invoice/template
// files the same way the seed does, to match against reality.
import { readWorkbook, pickStockSheet } from "@/lib/xlsx/read";
import { parseStockSheet } from "@/lib/import/parse";

const articles = new Set<string>();
for (const f of ["adidas-implementation.xlsx", "adidas-invoice.xlsx"]) {
  const p = path.join(process.cwd(), "seed", f);
  const wb = readWorkbook(readFileSync(p), f);
  const parsed = parseStockSheet(pickStockSheet(wb).rows);
  for (const r of parsed.rows) articles.add(r.article_number);
}
console.log("known articles:", articles.size);

const entries = readZip(readFileSync(zipPath));
const files = [...entries.keys()].map((p) => ({ path: p }));
const result = matchImageFilenames(files, [...articles]);
console.log(
  `matched ${result.matched.length}, unmatched ${result.unmatched.length}, CAD skipped ${result.skippedCad.length}`,
);

// Group by article; the matcher's sequence already orders views
// (Standard View first, CADs long since skipped).
const byArticle = new Map<string, { path: string; sequence: number; filename: string }[]>();
for (const m of result.matched) {
  const bucket = byArticle.get(m.article_number) ?? [];
  bucket.push({ path: m.path, sequence: m.sequence, filename: m.filename });
  byArticle.set(m.article_number, bucket);
}

const outDir = path.join(process.cwd(), "public", "seed-images");

// Clear the old single-view files so the directory has one naming scheme.
for (const f of readdirSync(outDir)) {
  if (/^[A-Za-z0-9]+-(400|800)\.webp$/.test(f)) unlinkSync(path.join(outDir, f));
}

let written = 0;
for (const [article, views] of byArticle) {
  views.sort((a, b) => a.sequence - b.sequence || a.filename.localeCompare(b.filename));
  let n = 0;
  for (const view of views) {
    n++;
    const buf = entries.get(view.path);
    if (!buf) continue;
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    writeFileSync(path.join(outDir, `${article}-${n}-800.webp`), out);
    written++;
  }
}
console.log(`wrote ${written} webp files across ${byArticle.size} articles -> public/seed-images`);
