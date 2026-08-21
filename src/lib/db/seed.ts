import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { all, get, now, run, setSetting, uid } from "./core";
import { readWorkbook, pickStockSheet } from "@/lib/xlsx/read";
import { parseStockSheet } from "@/lib/import/parse";
import { buildDiff, commitImport } from "@/lib/import/commit";
import { CATEGORIES } from "@/lib/domain/types";

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

function seedBrandingPlacements() {
  const existing = get<{ n: number }>("SELECT COUNT(*) AS n FROM branding_placements");
  if ((existing?.n ?? 0) > 0) return;

  for (const category of CATEGORIES) {
    const labels = PLACEMENTS[category];
    if (!labels) continue; // shoes, clubs, rangefinders, trolleys, junior-sets
    labels.forEach((label, i) => {
      run(
        `INSERT INTO branding_placements (id, category, label, sort_order, is_active)
         VALUES (?,?,?,?,1)`,
        uid(),
        category,
        label,
        i,
      );
    });
  }
}

/* -------------------------------------------------------------------------
   Notification recipients (§7.3)
   ---------------------------------------------------------------------- */

function seedRecipients() {
  const existing = get<{ n: number }>("SELECT COUNT(*) AS n FROM notification_recipients");
  if ((existing?.n ?? 0) > 0) return;

  // Placeholders. The owner replaces these in Admin → Recipients before
  // cutover; nothing is sent until real values are in and the channel is
  // configured, so seeding them is safe.
  const seeds: [string, "email" | "whatsapp", string][] = [
    ["Sales team", "email", "sales@pinhighuae.com"],
    ["Corporate desk", "email", "corporate@pinhighuae.com"],
  ];
  for (const [name, channel, value] of seeds) {
    run(
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

function templatePath(): string | null {
  const candidates = [
    process.env.PINHIGH_SEED_FILE,
    path.join(process.cwd(), "seed", "pinhigh-stock-template.xlsx"),
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function seedCatalogue(): boolean {
  const existing = get<{ n: number }>("SELECT COUNT(*) AS n FROM products");
  if ((existing?.n ?? 0) > 0) return false;

  const file = templatePath();
  if (!file) return false;

  const buf = readFileSync(file);
  const workbook = readWorkbook(buf, path.basename(file));
  const sheet = pickStockSheet(workbook);
  const parsed = parseStockSheet(sheet.rows);

  if (parsed.rows.length === 0) return false;

  const diff = buildDiff(parsed.rows, "upsert", parsed.issues, parsed.rowsRead, parsed.rowsFailed);
  commitImport(parsed.rows, "upsert", diff, {
    filename: path.basename(file),
    uploadedBy: "seed",
  });

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

function applyColourHex() {
  const products = all<{ id: string; colour: string }>(
    "SELECT id, colour FROM products WHERE colour_hex IS NULL",
  );
  for (const p of products) {
    // A colourway like "Flared / White" leads with its dominant colour.
    const lead = p.colour.split("/")[0].trim();
    const match =
      COLOUR_WORDS.find(([re]) => re.test(lead)) ?? COLOUR_WORDS.find(([re]) => re.test(p.colour));
    if (match) {
      run("UPDATE products SET colour_hex = ? WHERE id = ?", match[1], p.id);
    }
  }
}

/* -------------------------------------------------------------------------
   Entry point
   ---------------------------------------------------------------------- */

export function ensureSeeded(): void {
  if (globalThis.__pinhighSeeded) return;
  globalThis.__pinhighSeeded = true;

  try {
    seedBrandingPlacements();
    seedRecipients();
    const seeded = seedCatalogue();

    if (seeded && !get("SELECT 1 FROM settings WHERE key = 'seeded_at'")) {
      setSetting("seeded_at", now());
    }
  } catch (err) {
    // A failed seed must not take the site down — an empty catalogue with a
    // working admin panel is recoverable, a boot loop is not.
    globalThis.__pinhighSeeded = false;
    console.error("[pinhigh] seed failed:", err);
  }
}
