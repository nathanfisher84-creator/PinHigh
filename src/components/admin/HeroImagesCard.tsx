"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { uploadHeroImages, removeHeroImage, setHeroRotation } from "@/app/admin/actions";

/**
 * The owner's control over the home hero imagery: upload their own
 * backgrounds, and optionally rotate several as a marketing carousel.
 * No images uploaded = the standard course photograph, so the hero can
 * never end up blank.
 */
export function HeroImagesCard({
  images,
  rotate,
}: {
  images: string[];
  rotate: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <h2 className="label-caps mb-1">Hero background</h2>
      <p className="text-xs text-graphite-ink">
        {images.length === 0
          ? "Using the standard course photograph. Upload your own to replace it."
          : `${images.length} image${images.length === 1 ? "" : "s"} uploaded — the first shows unless rotation is on.`}
      </p>

      <form
        method="post"
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(async () => setResult(await uploadHeroImages(data)));
          e.currentTarget.reset();
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="images"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="block text-sm file:mr-3 file:border file:border-sand file:bg-paper file:px-3 file:py-1.5 file:text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-50"
          >
            {pending ? "Uploading…" : "Add to hero"}
          </button>
        </div>
        <p className="mt-1 text-xs text-graphite-ink">
          Wide images work best (1920px or more across). Up to 6; resized and
          optimised automatically.
        </p>
      </form>

      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((url, i) => (
            <li key={url} className="hairline bg-paper">
              <div className="relative aspect-video bg-paper-sunken">
                <Image src={url} alt="" fill sizes="200px" className="object-cover" />
                {i === 0 && !rotate && (
                  <span className="absolute left-0 top-0 bg-fairway px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper">
                    Showing
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs text-graphite-ink">#{i + 1}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => setResult(await removeHeroImage(url)))}
                  className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {images.length > 1 && (
        <label className="mt-4 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={rotate}
            disabled={pending}
            onChange={(e) => start(async () => setResult(await setHeroRotation(e.target.checked)))}
            className="mt-0.5 accent-[var(--color-fairway)]"
          />
          <span>
            <span className="font-medium">Rotate as a marketing carousel</span>
            <span className="block text-xs text-graphite-ink">
              Crossfades through your images every few seconds. Visitors who
              prefer reduced motion see the first image only.
            </span>
          </span>
        </label>
      )}

      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-2 text-xs ${result.ok ? "text-fairway" : "text-flag-ink"}`}
        >
          {result.message}
        </p>
      )}
    </section>
  );
}
