import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Blob storage for product imagery (spec §5).
 *
 * Spec §2 puts these in Supabase Storage. This is the same seam as the
 * database: one small module the rest of the app talks to, so swapping the
 * backend does not reach into the upload flow or the components.
 *
 * Product images are public — unlike customer artwork (§8), which is a
 * trademark and is served only through the authenticated admin route.
 */

const ROOT = path.join(
  process.env.PINHIGH_DATA_DIR ??
    (process.env.VERCEL ? "/tmp/pinhigh" : path.join(process.cwd(), ".data")),
  "images",
);

/** Storage keys are `{articleNumber}/{id}-{width}.webp`, always relative. */
export function imageKey(articleNumber: string, id: string, width: number): string {
  const slug = articleNumber.replace(/[^A-Za-z0-9_-]/g, "-");
  return `${slug}/${id}-${width}.webp`;
}

function resolve(key: string): string {
  // basename each segment so a crafted key cannot escape the root.
  const safe = key
    .split("/")
    .map((s) => path.basename(s))
    .filter((s) => s && s !== "." && s !== "..")
    .join(path.sep);
  const full = path.join(ROOT, safe);
  if (!full.startsWith(ROOT)) throw new Error("Invalid storage key.");
  return full;
}

export async function putImage(key: string, data: Buffer): Promise<void> {
  const full = resolve(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function getImage(key: string): Promise<Buffer | null> {
  const full = resolve(key);
  if (!existsSync(full)) return null;
  return readFile(full);
}

export async function deleteImage(key: string): Promise<void> {
  try {
    await unlink(resolve(key));
  } catch {
    // Already gone is the desired end state.
  }
}

/** Remove every rendition of one image id. */
export async function deleteRenditions(
  articleNumber: string,
  id: string,
  widths: readonly number[],
): Promise<void> {
  await Promise.all(widths.map((w) => deleteImage(imageKey(articleNumber, id, w))));
}

/** The public URL for a stored key. Served by the route in app/images. */
export function imageUrl(key: string): string {
  return `/images/${key}`;
}
