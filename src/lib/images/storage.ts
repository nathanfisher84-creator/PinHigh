import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Blob storage (spec §5, §8).
 *
 * Two backends behind one seam:
 *
 *   - Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 *     set — which is what makes uploads survive on Vercel, where the
 *     filesystem is wiped on every cold start. Product images go in a public
 *     bucket; customer artwork goes in a private one and is only ever served
 *     through the authenticated admin route.
 *   - Local disk under `.data/` otherwise, so everything works with no
 *     credentials.
 *
 * Product images are public — unlike customer artwork (§8), which is a
 * trademark and must never land in a public bucket or directory.
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const IMAGE_BUCKET = "product-images";
const ARTWORK_BUCKET = "artwork";

function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

const ROOT = path.join(
  process.env.PINHIGH_DATA_DIR ??
    (process.env.VERCEL ? "/tmp/pinhigh" : path.join(process.cwd(), ".data")),
  "images",
);

const PRIVATE_ROOT = path.join(
  process.env.PINHIGH_DATA_DIR ??
    (process.env.VERCEL ? "/tmp/pinhigh" : path.join(process.cwd(), ".data")),
  "private",
  "logos",
);

/** Storage keys are `{articleNumber}/{id}-{width}.webp`, always relative. */
export function imageKey(articleNumber: string, id: string, width: number): string {
  const slug = articleNumber.replace(/[^A-Za-z0-9_-]/g, "-");
  return `${slug}/${id}-${width}.webp`;
}

function resolveLocal(root: string, key: string): string {
  // basename each segment so a crafted key cannot escape the root.
  const safe = key
    .split("/")
    .map((s) => path.basename(s))
    .filter((s) => s && s !== "." && s !== "..")
    .join(path.sep);
  const full = path.join(root, safe);
  if (!full.startsWith(root)) throw new Error("Invalid storage key.");
  return full;
}

/* -------------------------------------------------------------------------
   Supabase Storage REST
   ---------------------------------------------------------------------- */

async function storageFetch(pathname: string, init: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      // Both headers, so either key generation works: the legacy JWT
      // service_role key authenticates via Authorization, the newer
      // sb_secret_... keys via apikey.
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY as string,
      ...(init.headers ?? {}),
    },
  });
}

const ensuredBuckets = new Set<string>();

/** Create the bucket on first use, so setup is just three env vars. */
async function ensureBucket(name: string, isPublic: boolean): Promise<void> {
  if (ensuredBuckets.has(name)) return;
  const res = await storageFetch(`/storage/v1/bucket/${name}`, { method: "GET" });
  if (res.status === 404 || res.status === 400) {
    const created = await storageFetch("/storage/v1/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, name, public: isPublic }),
    });
    // 409 = someone else created it between our check and our create. Fine.
    if (!created.ok && created.status !== 409) {
      const detail = await created.text().catch(() => "");
      throw new Error(`Could not create storage bucket ${name}: ${detail.slice(0, 200)}`);
    }
  }
  ensuredBuckets.add(name);
}

async function supabasePut(
  bucket: string,
  isPublic: boolean,
  key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  await ensureBucket(bucket, isPublic);
  const res = await storageFetch(`/storage/v1/object/${bucket}/${key}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(data),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

async function supabaseGet(bucket: string, key: string): Promise<Buffer | null> {
  const res = await storageFetch(`/storage/v1/object/${bucket}/${key}`, { method: "GET" });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function supabaseDelete(bucket: string, key: string): Promise<void> {
  await storageFetch(`/storage/v1/object/${bucket}/${key}`, { method: "DELETE" }).catch(() => {
    // Already gone is the desired end state.
  });
}

/* -------------------------------------------------------------------------
   Product images (public)
   ---------------------------------------------------------------------- */

export async function putImage(key: string, data: Buffer): Promise<void> {
  if (supabaseConfigured()) {
    await supabasePut(IMAGE_BUCKET, true, key, data, "image/webp");
    return;
  }
  const full = resolveLocal(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function getImage(key: string): Promise<Buffer | null> {
  if (supabaseConfigured()) {
    return supabaseGet(IMAGE_BUCKET, key);
  }
  const full = resolveLocal(ROOT, key);
  if (!existsSync(full)) return null;
  return readFile(full);
}

export async function deleteImage(key: string): Promise<void> {
  if (supabaseConfigured()) {
    await supabaseDelete(IMAGE_BUCKET, key);
    return;
  }
  try {
    await unlink(resolveLocal(ROOT, key));
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

/**
 * The public URL for a stored key. Absolute when the blob lives in Supabase,
 * app-served (`/images/...`) when it lives on disk. This is what gets written
 * to `product_images.storage_path`, so rows keep working after a backend move
 * — the path itself says where the bytes are.
 */
export function imageUrl(key: string): string {
  if (supabaseConfigured()) {
    return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${key}`;
  }
  return `/images/${key}`;
}

/* -------------------------------------------------------------------------
   Customer artwork (private — §8: "these are customers' trademarks")
   ---------------------------------------------------------------------- */

export async function putArtwork(
  name: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  if (supabaseConfigured()) {
    await supabasePut(ARTWORK_BUCKET, false, name, data, contentType);
    return;
  }
  const full = resolveLocal(PRIVATE_ROOT, name);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function getArtwork(name: string): Promise<Buffer | null> {
  if (supabaseConfigured()) {
    return supabaseGet(ARTWORK_BUCKET, name);
  }
  const full = resolveLocal(PRIVATE_ROOT, name);
  if (!existsSync(full)) return null;
  return readFile(full);
}
