"use server";

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { readZip, isMeaningfulEntry, ZipError } from "@/lib/zip";
import { matchImageFilenames } from "@/lib/images/match";
import { ImageError, MAX_INPUT_BYTES, MAX_ZIP_BYTES } from "@/lib/images/process";
import {
  addProductImage,
  articlesWithoutImages,
  deleteProductImage,
  getProductRef,
  listArticleNumbers,
  reorderImages,
  setPrimaryImage,
  updateAltText,
} from "@/lib/repo/images";
import { audit } from "@/lib/db";

/**
 * Image management actions (spec §5).
 *
 * The bulk zip flow mirrors the stock import deliberately: upload, then a
 * preview showing exactly what will happen and what will not, then a commit.
 * The owner has already learned that pattern on the screen they use weekly.
 */

const UPLOAD_DIR = path.join(
  process.env.PINHIGH_DATA_DIR ??
    (process.env.VERCEL ? "/tmp/pinhigh" : path.join(process.cwd(), ".data")),
  "uploads",
);

async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  return session.email;
}

/* -------------------------------------------------------------------------
   Single product
   ---------------------------------------------------------------------- */

export interface UploadResult {
  ok: boolean;
  added: number;
  message: string;
  errors: string[];
}

export async function uploadProductImages(
  articleNumber: string,
  formData: FormData,
): Promise<UploadResult> {
  await requireAdmin();

  const product = await getProductRef(articleNumber);
  if (!product) {
    return { ok: false, added: 0, message: "That article number no longer exists.", errors: [] };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { ok: false, added: 0, message: "Choose at least one image.", errors: [] };
  }

  const errors: string[] = [];
  let added = 0;

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await addProductImage(product, { buffer, filename: file.name });
      added++;
    } catch (err) {
      // One bad photo must not cost the owner the rest of the batch.
      errors.push(
        err instanceof ImageError ? err.message : `${file.name} could not be processed.`,
      );
    }
  }

  if (added > 0) {
    await audit("image.upload", articleNumber, { added, failed: errors.length });
    revalidatePath("/admin/products");
    revalidatePath(`/product/${articleNumber}`);
    revalidatePath("/catalogue");
    revalidatePath("/");
  }

  return {
    ok: added > 0,
    added,
    message:
      added > 0 ? `${added} ${added === 1 ? "image" : "images"} added.` : "Nothing was added.",
    errors,
  };
}

export async function removeProductImage(imageId: string, articleNumber: string) {
  await requireAdmin();
  await deleteProductImage(imageId);
  await audit("image.delete", imageId);
  revalidatePath("/admin/products");
  revalidatePath(`/product/${articleNumber}`);
  revalidatePath("/catalogue");
}

export async function makeImagePrimary(imageId: string, articleNumber: string) {
  await requireAdmin();
  setPrimaryImage(imageId);
  revalidatePath("/admin/products");
  revalidatePath(`/product/${articleNumber}`);
  revalidatePath("/catalogue");
}

export async function reorderProductImages(
  productId: string,
  orderedIds: string[],
  articleNumber: string,
) {
  await requireAdmin();
  reorderImages(productId, orderedIds);
  revalidatePath("/admin/products");
  revalidatePath(`/product/${articleNumber}`);
}

export async function saveAltText(imageId: string, altText: string) {
  await requireAdmin();
  updateAltText(imageId, altText);
  revalidatePath("/admin/products");
}

/* -------------------------------------------------------------------------
   Bulk zip (§5)
   ---------------------------------------------------------------------- */

export interface ZipPreview {
  ok: boolean;
  token?: string;
  filename?: string;
  message?: string;
  /** Files that resolved to an article number, grouped for display. */
  matched?: { article_number: string; files: string[] }[];
  /** Files we could not place. Shown so the owner can rename and retry. */
  unmatched?: { filename: string; reason: string }[];
  /** Visible products still without a photo after this pack is applied. */
  stillWithout?: string[];
  totalImages?: number;
  /** CAD line drawings left out — reported so the count adds up, not as a problem. */
  cadSkipped?: number;
}

export async function previewImageZip(formData: FormData): Promise<ZipPreview> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a .zip of photographs." };
  }
  if (file.size > MAX_ZIP_BYTES) {
    return {
      ok: false,
      message: `That pack is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
        MAX_ZIP_BYTES / 1024 / 1024
      } MB — upload it in a few batches.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let entries: Map<string, Buffer>;
  try {
    entries = readZip(buffer, "That file is not a readable .zip.");
  } catch (err) {
    return {
      ok: false,
      message: err instanceof ZipError ? err.message : "That zip could not be opened.",
    };
  }

  const paths = [...entries.keys()].filter(isMeaningfulEntry);
  if (paths.length === 0) {
    return { ok: false, message: "That zip has no files in it." };
  }

  const result = matchImageFilenames(
    paths.map((p) => ({ path: p })),
    (await listArticleNumbers()),
  );

  if (result.matched.length === 0) {
    return {
      ok: false,
      message:
        "None of these filenames match an article number. Name each photo after its article number — 41001_1.jpg, 41001_2.jpg — and try again.",
      unmatched: result.unmatched.map((u) => ({ filename: u.filename, reason: u.reason })),
    };
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const token = `${randomUUID()}.zip`;
  await writeFile(path.join(UPLOAD_DIR, token), buffer);

  // Group for a readable preview.
  const grouped = new Map<string, string[]>();
  for (const m of result.matched) {
    const bucket = grouped.get(m.article_number);
    if (bucket) bucket.push(m.filename);
    else grouped.set(m.article_number, [m.filename]);
  }

  const covered = new Set(result.articlesCovered);
  const stillWithout = (await articlesWithoutImages()).filter((a) => !covered.has(a));

  return {
    ok: true,
    token,
    filename: file.name,
    matched: [...grouped.entries()].map(([article_number, files]) => ({
      article_number,
      files,
    })),
    unmatched: result.unmatched.map((u) => ({ filename: u.filename, reason: u.reason })),
    stillWithout,
    totalImages: result.matched.length,
    cadSkipped: result.skippedCad.length,
  };
}

export interface ZipCommitResult {
  ok: boolean;
  message: string;
  added: number;
  failed: { filename: string; reason: string }[];
}

export async function commitImageZip(
  token: string,
  filename: string,
): Promise<ZipCommitResult> {
  const actor = await requireAdmin();

  const stored = path.join(UPLOAD_DIR, path.basename(token));
  if (!existsSync(stored)) {
    return {
      ok: false,
      message: "That upload has expired. Upload the zip again.",
      added: 0,
      failed: [],
    };
  }

  let entries: Map<string, Buffer>;
  try {
    entries = readZip(await readFile(stored), "That file is not a readable .zip.");
  } catch {
    return { ok: false, message: "That zip could not be reopened.", added: 0, failed: [] };
  }

  const paths = [...entries.keys()].filter(isMeaningfulEntry);

  // Re-match against the catalogue as it is now, not as it was at preview —
  // the same reasoning as rebuilding the stock diff before committing (§4.2).
  const result = matchImageFilenames(
    paths.map((p) => ({ path: p })),
    (await listArticleNumbers()),
  );

  const failed: { filename: string; reason: string }[] = [];
  let added = 0;

  for (const match of result.matched) {
    const product = await getProductRef(match.article_number);
    if (!product) {
      failed.push({ filename: match.filename, reason: "Article no longer exists." });
      continue;
    }

    const data = entries.get(match.path);
    if (!data) {
      failed.push({ filename: match.filename, reason: "Could not be read from the zip." });
      continue;
    }

    if (data.length > MAX_INPUT_BYTES) {
      failed.push({
        filename: match.filename,
        reason: `${(data.length / 1024 / 1024).toFixed(1)} MB — over the 5 MB limit.`,
      });
      continue;
    }

    try {
      await addProductImage(product, { buffer: data, filename: match.filename });
      added++;
    } catch (err) {
      failed.push({
        filename: match.filename,
        reason: err instanceof ImageError ? err.message : "Could not be processed.",
      });
    }
  }

  await audit("image.bulk", filename, { added, failed: failed.length }, actor);

  revalidatePath("/admin/products");
  revalidatePath("/catalogue");
  revalidatePath("/");

  const articles = result.articlesCovered.length;

  return {
    ok: added > 0,
    added,
    failed,
    message:
      added > 0
        ? `${added} ${added === 1 ? "photo" : "photos"} added across ${articles} ${
            articles === 1 ? "article" : "articles"
          }.`
        : "Nothing could be added.",
  };
}
