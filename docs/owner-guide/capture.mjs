/**
 * Captures every screenshot the owner's guide uses, from a freshly started
 * production build with the embedded database. Run from a directory where
 * `playwright` is installed:
 *
 *   node --import ../../tests/alias-hook.mjs capture.mjs
 *
 * The app's own fonts come from Google/Fontshare and are blocked here, so
 * screenshots use the browser's fallback face. Content is what matters.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(process.env.PW_DIR ? path.join(process.env.PW_DIR, "x.js") : import.meta.url);
const { chromium } = require("playwright");
const { totp } = await import("@/lib/totp");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SHOTS = path.join(ROOT, "docs", "owner-guide", "shots");
const PORT = 3411;
const BASE = `http://localhost:${PORT}`;
const OWNER = "declan@pinhighuae.com";
const BOOT_PW = "first-sign-in-password";
const STAFF = "sales@pinhighuae.com";

const env = {
  ...process.env,
  PINHIGH_DATA_DIR: mkdtempSync(path.join(tmpdir(), "pinhigh-guide-")),
  ADMIN_EMAIL: OWNER,
  ADMIN_PASSWORD: BOOT_PW,
  ADMIN_SESSION_SECRET: "owner-guide-capture-secret-0123456789abcdef",
  NODE_ENV: "production",
};
delete env.DATABASE_URL;

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitFor(url, ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start:\n" + serverLog);
}

const done = [];
const failed = [];
async function step(name, fn) {
  try { await fn(); done.push(name); } catch (e) { failed.push(`${name}: ${String(e).split("\n")[0]}`); }
}

/** Numbered callout badges next to elements, for the annotated figures.
 *  Selectors are Playwright selectors; positions are resolved here and
 *  painted into the page as absolutely positioned badges. */
async function annotate(page, marks) {
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const resolved = [];
  for (const { selector, n, at } of marks) {
    const loc = page.locator(selector).first();
    if (!(await loc.count())) continue;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const box = await loc.boundingBox();
    if (!box) continue;
    const s = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    resolved.push({ n, at, x: box.x + s.x, y: box.y + s.y, w: box.width, h: box.height });
  }
  await page.evaluate(({ resolved, scroll }) => {
    window.scrollTo(scroll.x, scroll.y);
    document.querySelectorAll(".guide-callout, .guide-outline").forEach((n) => n.remove());
    for (const m of resolved) {
      const o = document.createElement("div");
      o.className = "guide-outline";
      Object.assign(o.style, {
        position: "absolute", left: `${m.x - 4}px`, top: `${m.y - 4}px`, width: `${m.w + 8}px`, height: `${m.h + 8}px`,
        border: "3px solid #D93A2B", borderRadius: "4px", pointerEvents: "none", zIndex: 99998, boxSizing: "border-box",
      });
      document.body.appendChild(o);
      const b = document.createElement("div");
      b.className = "guide-callout";
      b.textContent = String(m.n);
      const x = m.at === "right" ? m.x + m.w + 12 : m.x - 38;
      const y = m.at === "top" ? m.y - 36 : m.y + Math.min(6, m.h / 2 - 14);
      Object.assign(b.style, {
        position: "absolute", left: `${Math.max(2, x)}px`, top: `${Math.max(2, y)}px`, width: "28px", height: "28px",
        borderRadius: "50%", background: "#D93A2B", color: "#fff", font: "700 15px/28px system-ui, sans-serif",
        textAlign: "center", zIndex: 99999, boxShadow: "0 0 0 3px #fff, 0 2px 6px rgba(0,0,0,.35)",
      });
      document.body.appendChild(b);
    }
  }, { resolved, scroll });
}
async function clearAnnotations(page) {
  await page.evaluate(() => document.querySelectorAll(".guide-callout, .guide-outline").forEach((n) => n.remove()));
}

const exe = existsSync(chromium.executablePath()) ? undefined : "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: exe });
async function newCtx(width = 1280, height = 800) {
  const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5 });
  c.setDefaultTimeout(20000);
  await c.route(/^(?!http:\/\/localhost)/, (route) => route.abort());
  return c;
}
const shotPath = (n) => path.join(SHOTS, `${n}.png`);

try {
  await waitFor(`${BASE}/`);

  /* ---------------- The buyer's side ---------------- */
  const buyer = await (await newCtx()).newPage();
  await step("public-home", async () => {
    await buyer.goto(`${BASE}/`);
    await buyer.waitForLoadState("networkidle").catch(() => {});
    await buyer.screenshot({ path: shotPath("public-home"), fullPage: false });
  });
  await step("public-catalogue", async () => {
    await buyer.goto(`${BASE}/catalogue`);
    await buyer.waitForLoadState("networkidle").catch(() => {});
    await buyer.screenshot({ path: shotPath("public-catalogue"), fullPage: false });
  });
  await step("public-product", async () => {
    await buyer.goto(`${BASE}/product/HZ6893`);
    await buyer.waitForLoadState("networkidle").catch(() => {});
    await buyer.screenshot({ path: shotPath("public-product"), fullPage: true });
    // Add two sizes to the order
    // The grid renders a hidden phone list and the desktop table; only the visible cells count.
    const inputs = buyer.locator('input[type="number"]:not([disabled]):visible');
    await inputs.nth(0).fill("12");
    await inputs.nth(1).fill("8");
    await buyer.waitForTimeout(600);
    await buyer.screenshot({ path: shotPath("public-product-sizes"), fullPage: true });
  });
  await step("public-quote-form", async () => {
    await buyer.goto(`${BASE}/quote`);
    await buyer.waitForLoadState("networkidle").catch(() => {});
    await buyer.screenshot({ path: shotPath("public-quote-form"), fullPage: true });
  });
  await step("public-quote-confirmation", async () => {
    const fill = async (name, value) => { const l = buyer.locator(`[name="${name}"]`); if (await l.count()) await l.first().fill(value); };
    await fill("company_name", "Emirates Hills Golf Society");
    await fill("contact_name", "Sara Al Mansoori");
    await fill("contact_role", "Events Manager");
    await fill("email", "sara@example.com");
    await fill("phone", "501234567");
    await fill("notes", "Logo on the left chest, please. Event is the first week of November.");
    for (const sel of ['select[name="delivery_emirate"]', 'select[name="phone_country"]']) {
      const l = buyer.locator(sel);
      if (await l.count()) {
        const opts = await l.first().locator("option").allTextContents();
        const idx = opts.findIndex((o, i) => i > 0 && o.trim());
        if (idx > 0) await l.first().selectOption({ index: idx });
      }
    }
    const date = buyer.locator('input[name="required_by"]');
    if (await date.count()) await date.first().fill("2026-11-02");
    const boxes = buyer.locator('input[type="checkbox"][required]');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await buyer.click('button[type="submit"]:has-text("Request a quote")');
    await buyer.waitForURL(/\/quote\/PH-/, { timeout: 30000 });
    await buyer.waitForLoadState("networkidle").catch(() => {});
    await buyer.screenshot({ path: shotPath("public-quote-confirmation"), fullPage: true });
  });

  /* ---------------- The owner's side ---------------- */
  const page = await (await newCtx()).newPage();
  const shot = (n, opts = {}) => page.screenshot({ path: shotPath(n), fullPage: false, ...opts });

  await step("login", async () => {
    await page.goto(`${BASE}/admin/login`);
    await shot("login");
    await annotate(page, [
      { selector: "#email", n: 1 }, { selector: "#password", n: 2 },
      { selector: 'button[type="submit"]', n: 3 }, { selector: 'a[href="/admin/forgot"]', n: 4 },
    ]);
    await shot("login-annotated");
    await clearAnnotations(page);
  });

  let ownerKey = "";
  await step("security-enrol", async () => {
    await page.fill("#email", OWNER);
    await page.fill("#password", BOOT_PW);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/security/);
    await page.waitForSelector('[aria-label="QR code for your authenticator app"] svg');
    await shot("security-enrol", { fullPage: true });
    ownerKey = (await page.locator("p.select-all.tabular").first().innerText()).replace(/\s/g, "");
    await annotate(page, [
      { selector: '[aria-label="QR code for your authenticator app"]', n: 1 },
      { selector: "p.select-all.tabular", n: 2, at: "right" },
      { selector: 'input[name="code"]', n: 3 },
      { selector: 'button:has-text("Turn on")', n: 4, at: "right" },
    ]);
    await shot("security-enrol-annotated", { fullPage: true });
    await clearAnnotations(page);
  });
  await step("security-recovery", async () => {
    await page.fill('input[name="code"]', totp(ownerKey));
    await page.click('button:has-text("Turn on")');
    await page.waitForSelector("li.select-all");
    await page.locator("section:has(li.select-all)").screenshot({ path: shotPath("security-recovery-codes") });
    await page.check('input[type="checkbox"]');
    await page.click('a:has-text("Continue to the dashboard")');
    await page.waitForURL(/\/admin$/);
  });

  await step("dashboard", async () => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector("text=System status");
    await shot("dashboard", { fullPage: true });
    await page.locator("section:has-text('System status')").first().screenshot({ path: shotPath("dashboard-status-card") });
    await annotate(page, [
      { selector: "section:has-text('System status')", n: 1 },
      { selector: "nav[aria-label='Admin sections'] a[href='/admin/quotes']", n: 2, at: "top" },
      { selector: "a[href='/admin/quotes?status=new']", n: 3 },
      { selector: "a.bg-fairway[href='/admin/stock']", n: 4, at: "right" },
    ]);
    await shot("dashboard-annotated", { fullPage: true });
    await clearAnnotations(page);
  });

  await step("quotes", async () => {
    await page.goto(`${BASE}/admin/quotes`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("quotes-list", { fullPage: true });
    // The first /admin/quotes/… link is the CSV export; a request link carries its reference.
    const link = page.locator('a[href^="/admin/quotes/"]:has-text("PH-")').first();
    await link.click();
    await page.waitForURL(/\/admin\/quotes\/[^/]+$/);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("quote-detail", { fullPage: true });
  });

  await step("stock", async () => {
    await page.goto(`${BASE}/admin/stock`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("stock", { fullPage: true });
    await page.goto(`${BASE}/admin/stock/history`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("stock-history", { fullPage: true });
    await page.goto(`${BASE}/admin/stock/uploads`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("stock-uploads", { fullPage: true });
  });

  await step("products", async () => {
    await page.goto(`${BASE}/admin/products`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("products", { fullPage: true });
  });

  await step("recipients", async () => {
    await page.goto(`${BASE}/admin/recipients`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("recipients", { fullPage: true });
  });

  await step("settings", async () => {
    await page.goto(`${BASE}/admin/settings`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("settings", { fullPage: true });
    await page.locator("section:has-text('Email sending')").first().screenshot({ path: shotPath("settings-email") });
    await page.locator("section:has-text('Hero background')").first().screenshot({ path: shotPath("settings-hero") }).catch(() => {});
    await page.locator("section:has-text('Front flyer')").first().screenshot({ path: shotPath("settings-flyer") });
    await page.locator("section:has-text('Quoting')").first().screenshot({ path: shotPath("settings-quoting") });
    await page.locator("section:has-text('Contact details')").first().screenshot({ path: shotPath("settings-contact") });
    await page.locator("section:has-text('Announcement banner')").first().screenshot({ path: shotPath("settings-announcement") });
  });

  await step("users", async () => {
    await page.goto(`${BASE}/admin/users`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("users");
    await page.fill("#invite-email", STAFF);
    await page.click('button:has-text("Send invitation")');
    await page.waitForSelector("p.select-all.tabular");
    await shot("users-invite-link");
    await annotate(page, [
      { selector: "section:has-text('Accounts')", n: 1 },
      { selector: "#invite-email", n: 2 },
      { selector: "#invite-role", n: 3 },
      { selector: 'button:has-text("Send invitation")', n: 4 },
    ]);
    await shot("users-annotated");
    await clearAnnotations(page);
  });

  await step("security-enabled", async () => {
    await page.goto(`${BASE}/admin/security`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot("security-enabled", { fullPage: true });
  });

  await step("help", async () => {
    await page.goto(`${BASE}/admin/help`);
    await shot("help");
  });

  await step("login-mfa-step", async () => {
    await page.click('button:has-text("Sign out")');
    await page.waitForURL(/\/admin\/login/);
    await page.fill("#email", OWNER);
    await page.fill("#password", BOOT_PW);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/login\/mfa/);
    await shot("login-mfa");
  });

  await step("forgot", async () => {
    await page.goto(`${BASE}/admin/forgot`);
    await shot("forgot");
  });

} finally {
  await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}

console.log("captured:", done.join(", "));
if (failed.length) { console.log("FAILED:\n  " + failed.join("\n  ")); }
