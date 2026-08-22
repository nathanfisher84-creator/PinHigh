/**
 * Buyer-facing style titles.
 *
 * adidas' implementation file stores Article Name as SAP shouting
 * (`PERF TXT POLO`) and the importer title-cases that into the catalogue
 * identity (`Perf Txt Polo`). That stored form is what a re-import matches
 * against — rewriting it in the database would make the next template look
 * like a rename.
 *
 * Buyers see this layer instead. Only tokens we can justify are expanded.
 * Colour codes (Frotur, Dualin, Colnav, …) are not touched: they are not a
 * documented vocabulary, and inventing "Frozen Turquoise" from FROTUR was
 * previously forbidden.
 */

/**
 * Exact stored `style_name` values from the current adidas template, mapped
 * to a conservative public title.
 *
 *   PERF → Performance (adidas Performance)
 *   TXT  → Textured (standard apparel vs solid/print)
 *   ADI  → dropped; the brand is already rendered beside the title
 *   ULT365 → Ultimate365 (adidas Golf's official franchise name)
 *   SLD  → Solid
 *   M    → Men's (SAP gender prefix)
 *   HD   → Hoodie (standard adidas SAP garment code)
 *
 * Tokens we cannot justify are left as written: H on the Performance polo,
 * BU on the driver hoodie.
 */
const STYLE_DISPLAY_ALIASES: Record<string, string> = {
  "perf txt polo": "Performance Textured Polo",
  "adi perf polo": "Performance Polo",
  "adi perf h polo": "Performance H Polo",
  "ult365 sld polo": "Ultimate365 Solid Polo",
  "m bu driver hd": "Men's BU Driver Hoodie",
};

function aliasKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Public title for a stored style name. Unknown names pass through unchanged. */
export function displayStyleName(stored: string): string {
  const key = aliasKey(stored);
  return STYLE_DISPLAY_ALIASES[key] ?? stored;
}

/** Replace stored SAP titles inside a longer string (image alt, etc.). */
export function displayStyleNameInText(text: string): string {
  let out = text;
  for (const [stored, display] of Object.entries(STYLE_DISPLAY_ALIASES)) {
    const re = new RegExp(stored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, display);
  }
  return out;
}

/**
 * Stored style names whose public title (or stored form) contains `query`.
 * Used so a buyer searching "Performance Textured" still finds Perf Txt Polo.
 */
export function storedStyleNamesForQuery(query: string): string[] {
  const needle = aliasKey(query);
  if (!needle) return [];
  const hits: string[] = [];
  for (const [stored, display] of Object.entries(STYLE_DISPLAY_ALIASES)) {
    if (display.toLowerCase().includes(needle) || stored.includes(needle)) {
      hits.push(stored);
    }
  }
  return hits;
}
