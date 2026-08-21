"use client";

import { useRef, useState, useTransition } from "react";
import {
  previewImageZip,
  commitImageZip,
  type ZipPreview,
} from "@/app/admin/image-actions";

/**
 * Bulk image upload (spec §5).
 *
 * "Accept a .zip and auto-match filenames to products by article number...
 * Show a match preview listing unmatched files and products left without
 * images before committing."
 *
 * The preview is the whole point. A supplier pack arrives with a few hundred
 * photographs and some of them will be named wrong; the owner needs to see
 * which before anything is written, not discover it later on a product page.
 */
export function BulkImageUpload() {
  const [preview, setPreview] = useState<ZipPreview | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; failed: { filename: string; reason: string }[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      setPreview(await previewImageZip(formData));
    });
  };

  const commit = () => {
    if (!preview?.token || !preview.filename) return;
    startTransition(async () => {
      const res = await commitImageZip(preview.token!, preview.filename!);
      setResult({ ok: res.ok, message: res.message, failed: res.failed });
      if (res.ok) {
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <section>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        className={[
          "hairline px-6 py-8 text-center transition-colors duration-150",
          dragging ? "border-fairway bg-fairway-wash" : "bg-paper-raised",
        ].join(" ")}
      >
        <p className="font-medium">Drop a folder of photos here, zipped</p>
        <p className="mt-1 text-sm text-graphite-ink max-w-lg mx-auto">
          The photo pack adidas send you, exactly as it arrives. The first six
          characters of each filename are the article number —{" "}
          <span className="tabular">HZ6891_Standard View.jpeg</span> — so they
          land on the right products by themselves. The ghost-mannequin
          &ldquo;Standard View&rdquo; becomes the main image, and the CAD line
          drawings are left out. Sub-folders are fine.
        </p>
        <label className="mt-4 inline-block">
          <span className="cursor-pointer bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 inline-block">
            Choose a zip
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
      </div>

      {pending && (
        <p className="mt-4 text-sm text-graphite-ink" role="status">
          Working through the pack — resizing a few hundred photos takes a moment.
        </p>
      )}

      {result && (
        <div
          className={[
            "mt-4 hairline px-4 py-3 text-sm",
            result.ok ? "border-fairway bg-fairway-wash" : "border-flag bg-flag-wash",
          ].join(" ")}
          role="status"
        >
          <p>{result.message}</p>
          {result.failed.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {result.failed.map((f) => (
                <li key={f.filename}>
                  <span className="tabular">{f.filename}</span> — {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && !preview.ok && preview.message && (
        <div className="mt-4 hairline border-flag bg-flag-wash px-4 py-3 text-sm" role="alert">
          <p>{preview.message}</p>
          {preview.unmatched && preview.unmatched.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs underline underline-offset-2">
                Show the {preview.unmatched.length} files
              </summary>
              <ul className="mt-2 space-y-0.5 text-xs max-h-48 overflow-y-auto scroll-x">
                {preview.unmatched.map((u) => (
                  <li key={u.filename} className="tabular">
                    {u.filename}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Match preview (§5) */}
      {preview?.ok && (
        <div className="mt-6">
          <h3 className="text-lg">What will be added</h3>
          <p className="tabular mt-1">
            {preview.totalImages} photos across {preview.matched?.length ?? 0} articles
            {preview.cadSkipped ? ` · ${preview.cadSkipped} CAD drawings skipped` : ""}
            {preview.unmatched?.length ? ` · ${preview.unmatched.length} not matched` : ""}
          </p>
          {!!preview.cadSkipped && (
            <p className="mt-1 text-sm text-graphite-ink">
              adidas ship a flat line drawing beside each photograph — the
              numbered ones like{" "}
              <span className="tabular">Standard View-1</span>. Those are left
              out; only the real product shots are uploaded.
            </p>
          )}
          <p className="mt-1 text-sm text-graphite-ink">
            From <strong>{preview.filename}</strong>
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="hairline bg-paper-raised">
              <h4 className="border-b border-sand px-4 py-2 label-caps">Matched</h4>
              <ul className="max-h-72 overflow-y-auto scroll-x divide-y divide-sand text-sm">
                {preview.matched?.map((m) => (
                  <li key={m.article_number} className="px-4 py-2">
                    <span className="tabular font-medium">{m.article_number}</span>
                    <span className="text-graphite-ink">
                      {" "}
                      — {m.files.length} {m.files.length === 1 ? "photo" : "photos"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="hairline bg-paper-raised">
              <h4 className="border-b border-sand px-4 py-2 label-caps">
                Not matched
                {preview.unmatched?.length ? ` (${preview.unmatched.length})` : ""}
              </h4>
              {preview.unmatched?.length ? (
                <ul className="max-h-72 overflow-y-auto scroll-x divide-y divide-sand text-sm">
                  {preview.unmatched.map((u) => (
                    <li key={u.filename} className="px-4 py-2">
                      <span className="tabular">{u.filename}</span>
                      <span className="block text-xs text-graphite-ink">{u.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-graphite-ink">
                  Every file in the pack matched an article number.
                </p>
              )}
            </div>
          </div>

          {/* Products left without a photo (§5) */}
          {preview.stillWithout && preview.stillWithout.length > 0 && (
            <details className="mt-4 hairline bg-paper-raised px-4 py-3">
              <summary className="cursor-pointer text-sm">
                <strong className="tabular">{preview.stillWithout.length}</strong> products
                will still have no photo after this
              </summary>
              <p className="mt-2 tabular text-xs text-graphite-ink break-words">
                {preview.stillWithout.join(", ")}
              </p>
            </details>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={pending}
              className="bg-fairway px-5 py-2.5 text-paper font-medium hover:bg-ink transition-colors duration-150 disabled:opacity-60"
            >
              {pending ? "Adding…" : `Add these ${preview.totalImages} photos`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="hairline px-5 py-2.5 hover:border-graphite transition-colors duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
