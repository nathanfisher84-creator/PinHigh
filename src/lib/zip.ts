import { inflateRawSync } from "node:zlib";

/**
 * Minimal read-only zip reader on Node builtins.
 *
 * Shared by two features that both take a zip from the owner: the stock
 * importer reads .xlsx (which is a zip), and the bulk image upload (§5) reads
 * a folder of supplier photographs. Keeping one implementation means the
 * awkward parts — the local-header walk, tolerating junk members — are
 * reasoned about once.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

/**
 * Read every member into memory, keyed by its path inside the archive.
 *
 * Callers hold the whole archive in memory, so they must cap the input size
 * before calling — see MAX_ZIP_BYTES at each call site.
 */
export function readZip(buf: Buffer, notAZipMessage?: string): Map<string, Buffer> {
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
  if (eocd === -1) {
    throw new ZipError(notAZipMessage ?? "That file isn't a readable zip archive.");
  }

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
    // Normalise separators. The zip spec says members use forward slashes, but
    // Windows tools — including PowerShell's Compress-Archive, which is exactly
    // what the owner will reach for — write backslashes. Fixing it here means
    // neither the junk filter nor the filename matcher has to know.
    const name = buf
      .toString("utf8", ptr + 46, ptr + 46 + nameLen)
      .replace(/\\/g, "/");

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
        // A member we cannot inflate is skipped rather than fatal — in an
        // .xlsx it is usually a thumbnail nothing reads, and in an image pack
        // one unreadable photo must not cost the owner the other 200.
      }
    }

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Members that are real files the owner meant to include.
 *
 * Drops directory entries, macOS resource forks (`__MACOSX/`, `._name`),
 * Windows `Thumbs.db` and hidden dotfiles. Supplier packs are full of these
 * and reporting them as "unmatched" would bury the ones that actually matter.
 */
export function isMeaningfulEntry(name: string): boolean {
  if (name.endsWith("/")) return false;
  if (name.startsWith("__MACOSX/") || name.includes("/__MACOSX/")) return false;
  const base = name.split("/").pop() ?? name;
  if (!base || base.startsWith("._") || base.startsWith(".")) return false;
  if (/^(thumbs\.db|desktop\.ini)$/i.test(base)) return false;
  return true;
}
