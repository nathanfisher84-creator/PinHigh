import "server-only";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { all, get, now, run, setSetting, uid } from "./core";
import { readWorkbook, pickStockSheet } from "@/lib/xlsx/read";
import { parseStockSheet } from "@/lib/import/parse";
import { buildDiff, commitImport } from "@/lib/import/commit";
import { CATEGORIES } from "@/lib/domain/types";
import { defaultAltText } from "@/lib/images/process";

/**
 * First-run bootstrap.
 *
 * The catalogue is seeded by running the supplied template through the real
 * importer rather than by writing rows directly. That way the seed is a
 * continuous test of §4 — if the importer regresses, the app is empty on the
 * next boot and the failure is loud rather than latent.
 */

/* -------------------------------------------------------------------------
   Branding placements (§8) — per category, owner-editable
   ---------------------------------------------------------------------- */

const APPAREL = [
  "polos",
  "t-shirts",
  "mid-layers",
  "outerwear",
  "trousers",
  "shorts",
  "skorts",
] as const;

const PLACEMENTS: Record<string, string[]> = {
  ...Object.fromEntries(
    APPAREL.map((c) => [c, ["Left chest", "Right chest", "Sleeve", "Back neck"]]),
  ),
  caps: ["Front", "Side", "Rear"],
  "golf-bags": ["Front panel"],
  balls: ["Single position"],
  towels: ["Single position"],
  umbrellas: ["Panel"],
  gloves: ["Cuff"],
  belts: ["Buckle"],
  socks: ["Cuff"],
  accessories: ["Single position"],
};

async function seedBrandingPlacements() {
  const existing = await get<{ n: number }>("SELECT COUNT(*) AS n FROM branding_placements");
  if ((existing?.n ?? 0) > 0) return;

  for (const category of CATEGORIES) {
    const labels = PLACEMENTS[category];
    if (!labels) continue; // shoes, clubs, rangefinders, trolleys, junior-sets
    for (const [i, label] of labels.entries()) {
      await run(
        `INSERT INTO branding_placements (id, category, label, sort_order, is_active)
         VALUES (?,?,?,?,1)`,
        uid(),
        category,
        label,
        i,
      );
    }
  }
}

/* -------------------------------------------------------------------------
   Notification recipients (§7.3)
   ---------------------------------------------------------------------- */

async function seedRecipients() {
  const existing = await get<{ n: number }>("SELECT COUNT(*) AS n FROM notification_recipients");
  if ((existing?.n ?? 0) > 0) return;

  // Placeholders. The owner replaces these in Admin → Recipients before
  // cutover; nothing is sent until real values are in and the channel is
  // configured, so seeding them is safe.
  const seeds: [string, "email" | "whatsapp", string][] = [
    ["Sales team", "email", "sales@pinhighuae.com"],
    ["Corporate desk", "email", "corporate@pinhighuae.com"],
  ];
  for (const [name, channel, value] of seeds) {
    await run(
      `INSERT INTO notification_recipients (id, name, channel, value, is_active, receives)
       VALUES (?,?,?,?,1,?)`,
      uid(),
      name,
      channel,
      value,
      JSON.stringify(["quote_request"]),
    );
  }
}

/* -------------------------------------------------------------------------
   Catalogue
   ---------------------------------------------------------------------- */

function seedFile(name: string): string | null {
  const candidate = path.join(process.cwd(), "seed", name);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Seed the catalogue the way the business actually works:
 *
 *   1. the implementation file  — what the products are
 *   2. the invoice              — what is actually on the shelf
 *
 * Running both proves the whole path on every cold boot. If either importer
 * regresses the site comes up wrong immediately, rather than the failure
 * hiding until someone uploads a real file.
 */
async function importSeedFile(
  file: string,
): Promise<{ rows: number; source?: string; invoices?: string[]; orders?: string[] } | null> {
  const buf = readFileSync(file);
  const workbook = readWorkbook(buf, path.basename(file));
  const sheet = pickStockSheet(workbook);
  const parsed = parseStockSheet(sheet.rows);
  if (parsed.rows.length === 0) return null;

  const mode =
    parsed.source === "adidas-order"
      ? "details"
      : parsed.source === "adidas"
        ? "add"
        : "upsert";

  const diff = await buildDiff(parsed.rows, mode, parsed.issues, parsed.rowsRead, parsed.rowsFailed);
  (await commitImport(parsed.rows, mode, diff, {
    filename: path.basename(file),
    uploadedBy: "seed",
    invoiceRefs: parsed.billingDocuments,
    orderRefs: parsed.orderNumbers,
  }));

  return { rows: parsed.rows.length, source: parsed.source };
}

/**
 * Another process won the seed claim and is writing right now. On a shared
 * database that matters in a way it never did per-process: a build worker
 * that carries on immediately would prerender static pages against a
 * half-seeded catalogue and bake that state in. So the losers wait for the
 * winner's `seeded_at` marker, with a deadline so a crashed seeder cannot
 * wedge every boot forever.
 */
async function waitForSeeder(): Promise<void> {
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    if (await get("SELECT 1 FROM settings WHERE key = 'seeded_at'")) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  console.error("[pinhigh] gave up waiting for another process to finish seeding");
}

/**
 * A claim whose holder died mid-seed would block seeding forever: the row is
 * permanent, `seeded_at` never arrives, and every later process waits out its
 * deadline against an empty catalogue. (This happened: a build was killed
 * seconds after claiming, and the next three deploys came up with 0 articles.)
 * A claim that is old and demonstrably went nowhere is taken over — the
 * UPDATE is guarded on the old timestamp, so two processes cannot both win.
 */
async function takeOverStaleClaim(): Promise<boolean> {
  if (await get("SELECT 1 FROM settings WHERE key = 'seeded_at'")) return false;

  const row = await get<{ updated_at: string }>(
    "SELECT updated_at FROM settings WHERE key = 'seed_claim'",
  );
  if (!row) return false;
  if (Date.now() - Date.parse(row.updated_at) < 10 * 60_000) return false;

  const steal = await run(
    "UPDATE settings SET value = ?, updated_at = ? WHERE key = 'seed_claim' AND updated_at = ?",
    String(process.pid),
    now(),
    row.updated_at,
  );
  if (Number(steal.changes ?? 0) === 0) return false;

  console.warn("[pinhigh] took over a stale seed claim from a process that died mid-seed");
  return true;
}

async function seedCatalogue(): Promise<boolean> {
  const existing = await get<{ n: number }>("SELECT COUNT(*) AS n FROM products");
  if ((existing?.n ?? 0) > 0) return false;

  /*
   * `next build` prerenders across several worker processes and each one boots
   * the app, so two can both see an empty catalogue and both seed. With the
   * invoice importing in "add" mode that doubled the stock — 1,500 units
   * instead of 750. This claim is a single atomic INSERT, so exactly one
   * process wins; the rest wait for it to finish.
   */
  const claim = await run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('seed_claim', ?, ?)
     ON CONFLICT(key) DO NOTHING`,
    String(process.pid),
    now(),
  );
  if (Number(claim.changes ?? 0) === 0 && !(await takeOverStaleClaim())) {
    await waitForSeeder();
    return false;
  }

  // Order matters: the template defines the products, the invoice fills in
  // the stock against them.
  const template =
    process.env.PINHIGH_SEED_FILE ?? seedFile("adidas-implementation.xlsx");
  const invoice = seedFile("adidas-invoice.xlsx");

  let seeded = false;
  if (template && existsSync(template)) {
    seeded = importSeedFile(template) !== null;
  }
  if (invoice) importSeedFile(invoice);

  if (!seeded) return false;

  // Colour swatches for the colour switcher (§6.3). The importer does not set
  // these — colour_hex is owner-set — but a catalogue with no swatches cannot
  // demonstrate the switcher, so derive a reasonable one from the colour name.
  applyColourHex();

  return true;
}

/**
 * Best-effort swatch colour from a colourway name. The owner overrides these
 * in Admin → Products; this only exists so the switcher has something to show
 * before anyone has touched it.
 */
const COLOUR_WORDS: [RegExp, string][] = [
  [/\bblack\b/i, "#1A1A1A"],
  [/\bwhite\b|\bcloud white\b/i, "#F2F2F0"],
  [/\bnavy\b|\bindigo\b|\bconavy\b|\bpeacoat\b|\bnight\b|\btrublu\b|\bmarine\b/i, "#1B2A4A"],
  [/\bblue\b|\broyal\b/i, "#2D5FA8"],
  [/\bgrey\b|\bgray\b|\bgraphite\b|\bquiet shade\b|\bhigh rise\b|\bsilver\b|\bpebble\b/i, "#8A8F93"],
  [/\bkhaki\b|\btaupe\b|\bsand\b|\bchrome\b/i, "#B8AE96"],
  [/\bpink\b|\bquartz\b/i, "#E8A0B4"],
  [/\bred\b|\bflared\b/i, "#C0392B"],
  [/\bgreen\b|\blime\b|\bfairway\b/i, "#3F7D4F"],
  [/\byellow\b|\bacid\b|\bbeam\b/i, "#E4C441"],
  [/\bpurple\b|\bviolet\b/i, "#6B4E8F"],
  [/\borange\b/i, "#DE7A34"],
  [/\bbrown\b|\bcoffee\b/i, "#6B5140"],
  [/\bacademy\b/i, "#22304C"],
  [/\bcrew navy\b/i, "#25324F"],
];

async function applyColourHex() {
  const products = await all<{ id: string; colour: string }>(
    "SELECT id, colour FROM products WHERE colour_hex IS NULL",
  );
  for (const p of products) {
    // A colourway like "Flared / White" leads with its dominant colour.
    const lead = p.colour.split("/")[0].trim();
    const match =
      COLOUR_WORDS.find(([re]) => re.test(lead)) ?? COLOUR_WORDS.find(([re]) => re.test(p.colour));
    if (match) {
      await run("UPDATE products SET colour_hex = ? WHERE id = ?", match[1], p.id);
    }
  }
}

/* -------------------------------------------------------------------------
   Product photography
   ---------------------------------------------------------------------- */

/**
 * Register the hero photograph that ships in the bundle.
 *
 * The renditions live in `public/seed-images`, already encoded, so this only
 * writes database rows — no image processing happens at boot. That matters on
 * Vercel, where each instance starts with an empty /tmp and is frozen the
 * moment it has responded, so anything deferred would never finish.
 *
 * They sit in `public` rather than beside the spreadsheets because Vercel
 * serves that straight from the CDN. Routing them through the image function
 * meant depending on output file tracing to include the files in *that*
 * route's bundle, which it did not — the rows seeded but every photograph
 * 404ed.
 *
 * One image per article. The full pack, with all five views, goes in through
 * Admin → Products.
 */
async function seedImages(): Promise<number> {
  const dir = path.join(process.cwd(), "public", "seed-images");
  if (!existsSync(dir)) return 0;

  const existing = await get<{ n: number }>("SELECT COUNT(*) AS n FROM product_images");
  if ((existing?.n ?? 0) > 0) return 0;

  // Largest rendition per article: `HZ6891-800.webp`.
  const widest = new Map<string, { file: string; width: number }>();
  for (const file of readdirSync(dir)) {
    const m = file.match(/^([A-Za-z0-9]+)-(\d+)\.webp$/);
    if (!m) continue;
    const [, article, width] = m;
    const seen = widest.get(article);
    if (!seen || Number(width) > seen.width) {
      widest.set(article, { file, width: Number(width) });
    }
  }

  let added = 0;
  for (const [article, { file }] of widest) {
    const product = await get<{ id: string; brand: string; style_name: string; colour: string }>(
      "SELECT id, brand, style_name, colour FROM products WHERE article_number = ?",
      article,
    );
    if (!product) continue;

    await run(
      `INSERT INTO product_images (id, product_id, storage_path, alt_text, is_primary, sort_order)
       VALUES (?,?,?,?,1,0)`,
      uid(),
      product.id,
      // Absolute, so it is served as a static asset rather than through
      // the image route. See the prefixing in repo/catalogue.ts.
      `/seed-images/${file}`,
      defaultAltText(product.brand, product.style_name, product.colour),
    );
    added++;
  }
  return added;
}

/* -------------------------------------------------------------------------
   Entry point
   ---------------------------------------------------------------------- */

export async function ensureSeeded(): Promise<void> {
  if (globalThis.__pinhighSeeded) return;
  globalThis.__pinhighSeeded = true;

  try {
    seedBrandingPlacements();
    seedRecipients();
    const seeded = await seedCatalogue();

    if (seeded) seedImages();

    if (seeded && !await get("SELECT 1 FROM settings WHERE key = 'seeded_at'")) {
      await setSetting("seeded_at", now());
    }
  } catch (err) {
    // A failed seed must not take the site down — an empty catalogue with a
    // working admin panel is recoverable, a boot loop is not.
    globalThis.__pinhighSeeded = false;
    console.error("[pinhigh] seed failed:", err);
  }
}
