import "server-only";
import { all, get, run, transaction, uid } from "@/lib/db";
import { deleteRenditions, imageKey, putImage } from "@/lib/images/storage";
import { defaultAltText, processImage, WIDTHS } from "@/lib/images/process";

/**
 * Product image records (spec §5).
 *
 * One row per image; the stored key names the smallest rendition and the
 * others sit beside it, so the serving route can pick a width. Deleting a row
 * removes every rendition — orphaned blobs are how a storage bill grows
 * without anyone noticing.
 */

export interface ProductImageRow {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: number;
  sort_order: number;
}

export function listImagesForProduct(productId: string): ProductImageRow[] {
  return all<ProductImageRow>(
    `SELECT * FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC`,
    productId,
  );
}

interface ProductRef {
  id: string;
  article_number: string;
  brand: string;
  style_name: string;
  colour: string;
}

export function getProductRef(articleNumber: string): ProductRef | undefined {
  return get<ProductRef>(
    "SELECT id, article_number, brand, style_name, colour FROM products WHERE article_number = ?",
    articleNumber,
  );
}

export function listArticleNumbers(): string[] {
  return all<{ article_number: string }>(
    "SELECT article_number FROM products ORDER BY article_number",
  ).map((r) => r.article_number);
}

/** Article numbers with no image yet — §5 wants these surfaced before commit. */
export function articlesWithoutImages(): string[] {
  return all<{ article_number: string }>(
    `SELECT p.article_number FROM products p
      WHERE p.is_visible = 1
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)
      ORDER BY p.article_number`,
  ).map((r) => r.article_number);
}

/**
 * Process and store one image against a product.
 *
 * Returns the new row id. The first image on a product becomes its primary
 * automatically — a product with images but no primary would render the
 * placeholder, which looks like a bug.
 */
export async function addProductImage(
  product: ProductRef,
  file: { buffer: Buffer; filename: string },
  options: { altText?: string } = {},
): Promise<string> {
  const processed = await processImage(file.buffer, file.filename);
  const id = uid();

  for (const rendition of processed.renditions) {
    await putImage(imageKey(product.article_number, id, rendition.width), rendition.data);
  }

  // Record the *largest* rendition as the canonical path. next/image resizes
  // down from whatever it is given, so pointing at the 400px thumbnail would
  // make every product photo on the site an upscaled blur.
  const largest = processed.renditions[processed.renditions.length - 1];

  const existing = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?",
    product.id,
  );
  const isFirst = (existing?.n ?? 0) === 0;

  const nextOrder = get<{ max: number }>(
    "SELECT COALESCE(MAX(sort_order), -1) AS max FROM product_images WHERE product_id = ?",
    product.id,
  );

  run(
    `INSERT INTO product_images (id, product_id, storage_path, alt_text, is_primary, sort_order)
     VALUES (?,?,?,?,?,?)`,
    id,
    product.id,
    imageKey(product.article_number, id, largest.width),
    options.altText ??
      defaultAltText(product.brand, product.style_name, product.colour),
    isFirst ? 1 : 0,
    (nextOrder?.max ?? -1) + 1,
  );

  return id;
}

export async function deleteProductImage(imageId: string): Promise<void> {
  const row = get<{ id: string; product_id: string; storage_path: string; is_primary: number }>(
    "SELECT id, product_id, storage_path, is_primary FROM product_images WHERE id = ?",
    imageId,
  );
  if (!row) return;

  const article = row.storage_path.split("/")[0];
  await deleteRenditions(article, imageId, WIDTHS);

  transaction(() => {
    run("DELETE FROM product_images WHERE id = ?", imageId);

    // Never leave a product with images but no primary.
    if (row.is_primary) {
      const next = get<{ id: string }>(
        "SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1",
        row.product_id,
      );
      if (next) run("UPDATE product_images SET is_primary = 1 WHERE id = ?", next.id);
    }
  });
}

export function setPrimaryImage(imageId: string): void {
  const row = get<{ product_id: string }>(
    "SELECT product_id FROM product_images WHERE id = ?",
    imageId,
  );
  if (!row) return;

  transaction(() => {
    run("UPDATE product_images SET is_primary = 0 WHERE product_id = ?", row.product_id);
    run("UPDATE product_images SET is_primary = 1 WHERE id = ?", imageId);
  });
}

export function reorderImages(productId: string, orderedIds: string[]): void {
  transaction(() => {
    orderedIds.forEach((id, index) => {
      run(
        "UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?",
        index,
        id,
        productId,
      );
    });
  });
}

export function updateAltText(imageId: string, altText: string): void {
  run("UPDATE product_images SET alt_text = ? WHERE id = ?", altText.trim() || null, imageId);
}
