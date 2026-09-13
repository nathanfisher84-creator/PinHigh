/**
 * Renders guide.html to Pin-High-Owner-Guide.pdf with Chromium, then writes
 * PNG previews of a few pages so the layout can be checked.
 *
 *   PW_DIR=<dir with playwright installed> node build-pdf.mjs
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(process.env.PW_DIR ? path.join(process.env.PW_DIR, "x.js") : import.meta.url);
const { chromium } = require("playwright");

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(HERE, "..", "Pin-High-Owner-Guide.pdf");

const exe = existsSync(chromium.executablePath()) ? undefined : "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
await page.goto(`file://${path.join(HERE, "guide.html")}`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.emulateMedia({ media: "print" });

const footer = `
    <div style="width:100%;font-family:Inter,system-ui,sans-serif;font-size:8.5px;color:#6b7280;padding:0 14mm;display:flex;justify-content:space-between">
      <span>Pin High UAE — Owner's Guide</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;

// The cover carries no running footer; every other page does. Chromium can't
// vary the footer per page, so render the two ranges separately and join them.
const COVER = path.join(HERE, "preview", "_cover.pdf");
const BODY = path.join(HERE, "preview", "_body.pdf");
await page.pdf({ path: COVER, format: "A4", printBackground: true, preferCSSPageSize: true, pageRanges: "1", displayHeaderFooter: false });
await page.pdf({
  path: BODY, format: "A4", printBackground: true, preferCSSPageSize: true, pageRanges: "2-",
  displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer,
});
await browser.close();

const previews = execFileSync("python3", ["-c", `
import pymupdf, sys
cover = pymupdf.open(${JSON.stringify(COVER)}); body = pymupdf.open(${JSON.stringify(BODY)})
cover.insert_pdf(body); cover.set_metadata({"title": "Pin High UAE — Owner's Guide", "author": "Pin High UAE", "subject": "How to run the Pin High UAE catalogue and quote platform"})
cover.save(${JSON.stringify(OUT)}, garbage=3, deflate=True); cover.close()
doc = pymupdf.open(${JSON.stringify(OUT)})
n = len(doc)
want = sorted(set([0, 1, 2, 3] + [n//3, n//2, (2*n)//3, n-2, n-1]))
out = []
for i in want:
    if 0 <= i < n:
        pix = doc[i].get_pixmap(dpi=70)
        p = ${JSON.stringify(path.join(HERE, "preview"))} + f"/page-{i+1:02d}.png"
        pix.save(p); out.append(p)
print(n); print("\\n".join(out))
`]).toString().trim().split("\n");
console.log(`PDF written: ${OUT}\npages: ${previews[0]}\npreviews:\n  ${previews.slice(1).join("\n  ")}`);
