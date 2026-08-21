import { inflateRawSync } from "node:zlib";

/**
 * Read-only XLSX / CSV parser (spec §4.1).
 *
 * Spec §2 names SheetJS. The npm distribution of `xlsx` is pinned at 0.18.5 and
 * carries CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS); the
 * fixed builds are published only to SheetJS's own CDN, which is an awkward
 * supply-chain dependency for a build the owner's future developer has to keep
 * running. The importer only ever needs to *read* a sheet, which is a small
 * enough job to do on Node builtins with no third-party code in the path.
 *
 * This parses the parts of the format the importer actually depends on:
 * the zip container, shared strings, and cell values. Formulas are read at
 * their cached value, which is what the owner sees on screen.
 *
 * Pure functions over a Buffer, so it is directly testable. Callers are
 * server-only — spec §2: "Parse server-side, never trust client input."
 */

export interface SheetData {
  name: string;
  rows: (string | null)[][];
}

export interface WorkbookData {
  sheets: SheetData[];
}

/* -------------------------------------------------------------------------
   Zip container
   ---------------------------------------------------------------------- */

interface ZipEntry {
  name: string;
  data: Buffer;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

function readZip(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  // Find the End Of Central Directory record by scanning back from the tail.
  // The comment field is at most 65535 bytes, so the search window is bounded.
  let eocd = -1;
  const minEocd = Math.max(0, buf.length - 65_557);
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new SpreadsheetError("That file isn't a readable .xlsx workbook.");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== SIG_CENTRAL) break;

    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    // Walk to the local header to find where the payload actually starts —
    // the local extra field is often a different length to the central one.
    if (localOffset + 30 <= buf.length) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compressedSize);
      try {
        entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
      } catch {
        // A part we cannot inflate is skipped rather than fatal — it may well
        // be a thumbnail or a drawing the importer never looks at.
      }
    }

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/* -------------------------------------------------------------------------
   XML helpers
   ---------------------------------------------------------------------- */

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Concatenate every <t> run inside a shared-string <si>, skipping ruby text. */
function sharedStringText(si: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(si)) !== null) out += m[1] ?? "";
  return decodeXml(out);
}

/** "BC" -> 54. Column letters to a zero-based index. */
function columnIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/* -------------------------------------------------------------------------
   Dates
   ---------------------------------------------------------------------- */

/**
 * Excel serial date -> ISO date. Excel's 1900 leap-year bug means serials at
 * or below 60 are off by one; the importer only reads dates from optional
 * columns, but getting this wrong silently shifts a required-by date.
 */
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2_958_465) return null;
  const days = serial > 59 ? serial - 25_569 : serial - 25_568;
  const ms = Math.round(days * 86_400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Number-format ids that Excel reserves for dates. */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47,
]);

function buildDateStyleSet(styles: string | undefined): Set<number> {
  const dateStyles = new Set<number>();
  if (!styles) return dateStyles;

  // Custom formats that contain date tokens outside a literal string.
  const customDateIds = new Set<number>();
  const fmtRe = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = fmtRe.exec(styles)) !== null) {
    const code = decodeXml(m[2]).replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (/[ymdhs]/i.test(code)) customDateIds.add(Number(m[1]));
  }

  // cellXfs is the style table cells point at via their s="" attribute.
  const xfsBlock = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!xfsBlock) return dateStyles;

  const xfRe = /<xf\b[^>]*>/g;
  let index = 0;
  let x: RegExpExecArray | null;
  while ((x = xfRe.exec(xfsBlock[1])) !== null) {
    const id = x[0].match(/numFmtId="(\d+)"/);
    if (id) {
      const n = Number(id[1]);
      if (BUILTIN_DATE_FORMATS.has(n) || customDateIds.has(n)) dateStyles.add(index);
    }
    index++;
  }
  return dateStyles;
}

/* -------------------------------------------------------------------------
   Sheet parsing
   ---------------------------------------------------------------------- */

function parseSheet(
  xml: string,
  shared: string[],
  dateStyles: Set<number>,
): (string | null)[][] {
  const rows: (string | null)[][] = [];

  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cells: (string | null)[] = [];
    const body = rowMatch[2];

    // Self-closing cells (<c r="B2"/>) are empty but still hold a position.
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(body)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";

      const refAttr = attrs.match(/\br="([A-Z]+)\d+"/);
      const col = refAttr ? columnIndex(refAttr[1]) : cells.length;

      const typeAttr = attrs.match(/\bt="([^"]+)"/);
      const type = typeAttr ? typeAttr[1] : "n";

      let value: string | null = null;

      if (type === "inlineStr") {
        value = sharedStringText(inner);
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const raw = decodeXml(vMatch[1]);
          if (type === "s") {
            value = shared[Number(raw)] ?? "";
          } else if (type === "b") {
            value = raw === "1" ? "TRUE" : "FALSE";
          } else if (type === "e") {
            value = null; // #REF!, #N/A — treat as blank rather than importing junk
          } else {
            const styleAttr = attrs.match(/\bs="(\d+)"/);
            const styled = styleAttr ? dateStyles.has(Number(styleAttr[1])) : false;
            const asDate = styled ? excelSerialToIso(Number(raw)) : null;
            value = asDate ?? raw;
          }
        }
      }

      while (cells.length < col) cells.push(null);
      cells[col] = value === null ? null : value.trim();
    }

    // Excel omits empty rows entirely; the importer reports row numbers back to
    // the owner, so keep positions honest by padding from the r attribute.
    const rowNumAttr = rowMatch[1].match(/\br="(\d+)"/);
    if (rowNumAttr) {
      const target = Number(rowNumAttr[1]) - 1;
      while (rows.length < target) rows.push([]);
    }
    rows.push(cells);
  }

  return rows;
}

/* -------------------------------------------------------------------------
   CSV
   ---------------------------------------------------------------------- */

/** RFC 4180 with the pragmatic additions: BOM, CRLF, and semicolon delimiters. */
export function parseCsv(text: string): (string | null)[][] {
  const src = text.replace(/^﻿/, "");

  // Excel on a European locale writes semicolon-delimited CSV. Sniff the first
  // line rather than making the owner care which one they exported.
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"));
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let field = "";
  let quoted = false;
  let touched = false;

  const endField = () => {
    row.push(touched || field.length ? field.trim() : null);
    field = "";
    touched = false;
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== null && c !== "")) rows.push(row);
    else rows.push([]);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      touched = true;
    } else if (ch === delimiter) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") {
      /* handled by the \n that follows */
    } else field += ch;
  }
  if (field.length || row.length) endRow();

  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

/* -------------------------------------------------------------------------
   Entry point
   ---------------------------------------------------------------------- */

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetError";
  }
}

export function readWorkbook(buf: Buffer, filename: string): WorkbookData {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
    return { sheets: [{ name: "Stock", rows: parseCsv(buf.toString("utf8")) }] };
  }

  // Old BIFF .xls is a different format entirely. Say so plainly instead of
  // half-reading it — a silently mangled stock file is worse than a refusal.
  if (buf.length >= 8 && buf.readUInt32LE(0) === 0xe011cfd0) {
    throw new SpreadsheetError(
      "This is an older .xls file. Open it in Excel and use Save As → Excel Workbook (.xlsx), then upload again.",
    );
  }

  const zip = readZip(buf);

  const workbookXml = zip.get("xl/workbook.xml")?.toString("utf8");
  if (!workbookXml) {
    throw new SpreadsheetError("That file isn't a readable .xlsx workbook.");
  }

  // Shared strings: the string table almost every text cell points into.
  const shared: string[] = [];
  const sstXml = zip.get("xl/sharedStrings.xml")?.toString("utf8");
  if (sstXml) {
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(sstXml)) !== null) shared.push(sharedStringText(m[1]));
  }

  const dateStyles = buildDateStyleSet(zip.get("xl/styles.xml")?.toString("utf8"));

  // Map each sheet's relationship id to the part that actually holds it.
  const relsXml = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const relTargets = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*>/g;
  let rel: RegExpExecArray | null;
  while ((rel = relRe.exec(relsXml)) !== null) {
    const id = rel[0].match(/Id="([^"]+)"/);
    const target = rel[0].match(/Target="([^"]+)"/);
    if (id && target) {
      const path = decodeXml(target[1]).replace(/^\/?xl\//, "").replace(/^\//, "");
      relTargets.set(id[1], `xl/${path}`);
    }
  }

  const sheets: SheetData[] = [];
  const sheetRe = /<sheet\b[^>]*\/>/g;
  let sheetTag: RegExpExecArray | null;
  let positional = 0;

  while ((sheetTag = sheetRe.exec(workbookXml)) !== null) {
    positional++;
    const nameAttr = sheetTag[0].match(/name="([^"]*)"/);
    const ridAttr = sheetTag[0].match(/r:id="([^"]+)"/);
    const state = sheetTag[0].match(/state="([^"]+)"/);
    if (state && state[1] !== "visible") continue;

    const part =
      (ridAttr && relTargets.get(ridAttr[1])) ?? `xl/worksheets/sheet${positional}.xml`;
    const sheetXml = zip.get(part)?.toString("utf8");
    if (!sheetXml) continue;

    sheets.push({
      name: nameAttr ? decodeXml(nameAttr[1]) : `Sheet${positional}`,
      rows: parseSheet(sheetXml, shared, dateStyles),
    });
  }

  if (sheets.length === 0) {
    throw new SpreadsheetError("That workbook has no readable sheets in it.");
  }

  return { sheets };
}

/**
 * Pick the sheet to import: the one named `Stock`, else the first (spec §4.1).
 * Matching is case- and space-insensitive because the owner's own file is as
 * likely to say "STOCK " as "Stock".
 */
export function pickStockSheet(wb: WorkbookData): SheetData {
  const named = wb.sheets.find(
    (s) => s.name.trim().toLowerCase().replace(/\s+/g, "") === "stock",
  );
  return named ?? wb.sheets[0];
}
