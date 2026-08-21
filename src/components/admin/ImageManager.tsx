"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import {
  uploadProductImages,
  removeProductImage,
  makeImagePrimary,
  reorderProductImages,
  saveAltText,
} from "@/app/admin/image-actions";
import type { ProductImageRow } from "@/lib/repo/images";

/**
 * Per-product image management (spec §5).
 *
 * "Drag-and-drop upload on each product, multiple images, reorderable, one
 * marked primary."
 *
 * Reordering is done with explicit move buttons rather than drag-and-drop.
 * Pointer dragging is unusable by keyboard and fiddly on a phone, and the
 * owner is as likely to be doing this on a tablet as at a desk — §11 assumes
 * exactly that. Buttons are also the only version that announces itself to a
 * screen reader without a live region.
 */
export function ImageManager({
  productId,
  articleNumber,
  images,
}: {
  productId: string;
  articleNumber: string;
  images: ProductImageRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage(null);
    setErrors([]);
    startTransition(async () => {
      const formData = new FormData();
      for (const file of Array.from(files)) formData.append("files", file);
      const res = await uploadProductImages(articleNumber, formData);
      setMessage(res.message);
      setErrors(res.errors);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const move = (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(() =>
      reorderProductImages(productId, next.map((i) => i.id), articleNumber),
    );
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={[
          "hairline px-4 py-4 text-center text-sm transition-colors duration-150",
          dragging ? "border-fairway bg-fairway-wash" : "bg-paper",
        ].join(" ")}
      >
        <label className="cursor-pointer">
          <span className="underline underline-offset-2">Choose photos</span>
          <span className="text-graphite-ink"> or drop them here</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        <p className="mt-1 text-xs text-graphite-ink">
          JPEG, PNG or WebP, up to 5 MB each. Converted and resized on upload.
        </p>
      </div>

      {pending && (
        <p className="mt-2 text-xs text-graphite-ink" role="status">
          Processing…
        </p>
      )}
      {message && (
        <p className="mt-2 text-xs" role="status">
          {message}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5" role="alert">
          {errors.map((e) => (
            <li key={e} className="text-xs text-flag-ink">
              {e}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="hairline bg-paper">
              <div className="relative aspect-square bg-paper-sunken">
                <Image
                  src={
                    img.storage_path.startsWith("/") || img.storage_path.startsWith("http")
                      ? img.storage_path
                      : `/images/${img.storage_path}`
                  }
                  alt={img.alt_text ?? ""}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
                {!!img.is_primary && (
                  <span className="absolute left-0 top-0 bg-fairway px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-paper">
                    Main
                  </span>
                )}
              </div>

              <div className="p-2 space-y-2">
                <label className="sr-only" htmlFor={`alt-${img.id}`}>
                  Alt text for image {i + 1}
                </label>
                <input
                  id={`alt-${img.id}`}
                  defaultValue={img.alt_text ?? ""}
                  placeholder="Describe the photo"
                  onBlur={(e) =>
                    startTransition(() => saveAltText(img.id, e.target.value))
                  }
                  className="w-full hairline bg-paper-raised px-2 py-1 text-xs focus:outline-none focus:border-fairway"
                />

                <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                  <button
                    type="button"
                    disabled={pending || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move image ${i + 1} earlier`}
                    className="hairline px-1.5 py-0.5 disabled:opacity-40 hover:border-fairway"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={pending || i === images.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move image ${i + 1} later`}
                    className="hairline px-1.5 py-0.5 disabled:opacity-40 hover:border-fairway"
                  >
                    →
                  </button>

                  {!img.is_primary && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() => makeImagePrimary(img.id, articleNumber))
                      }
                      className="hairline px-1.5 py-0.5 hover:border-fairway"
                    >
                      Make main
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(() => removeProductImage(img.id, articleNumber))
                    }
                    aria-label={`Delete image ${i + 1}`}
                    className="ml-auto text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
