"use client";

import { useRef, useState, useTransition } from "react";
import {
  previewStockFile,
  commitStockFile,
  type PreviewResult,
} from "@/app/admin/stock-actions";
import type { ImportMode } from "@/lib/import/commit";
import { units } from "@/lib/format";

/**
 * The stock import (spec §4.2).
 *
 * The flow is fixed by the spec and the ordering matters: upload, parse, show a
 * plain-language diff, choose a mode with the safe one preselected, then commit.
 * Nothing is written until the owner has seen what will change.
 *
 * The panel that gets the most visual weight is the one listing SKUs *absent*
 * from the file, because that is the only part of an import that can quietly
 * destroy value.
 */
export function StockImport() {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mode, setMode] = useState<ImportMode>("upsert");
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File, overrideMapping?: Record<string, number>) => {
    fileRef.current = file;
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("mode", mode);
      if (overrideMapping && Object.keys(overrideMapping).length > 0) {
        formData.set("mapping", JSON.stringify(overrideMapping));
      }
      setPreview(await previewStockFile(formData));
    });
  };

  const commit = () => {
    if (!preview?.token || !preview.filename) return;
    startTransition(async () => {
      const res = await commitStockFile(
        preview.token!,
        preview.filename!,
        mode,
        confirmation,
        Object.keys(mapping).length ? JSON.stringify(mapping) : undefined,
      );
      setResult(res);
      if (res.ok) {
        setPreview(null);
        setConfirmation("");
        setMapping({});
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const diff = preview?.diff;

  return (
    <div>
      {/* Drop zone */}
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
          "hairline px-6 py-10 text-center transition-colors duration-150",
          dragging ? "border-fairway bg-fairway-wash" : "bg-paper-raised",
        ].join(" ")}
      >
        <p className="font-medium">Drop your stock file here</p>
        <p className="mt-1 text-sm text-graphite-ink">
          .xlsx, .xls or .csv — up to 10 MB. Extra columns are ignored, so your
          working notes are safe.
        </p>
        <label className="mt-4 inline-block">
          <span className="cursor-pointer bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 inline-block">
            Choose a file
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv"
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
          Reading the file… a few thousand rows takes a moment.
        </p>
      )}

      {result && (
        <p
          className={[
            "mt-4 hairline px-4 py-3 text-sm",
            result.ok ? "border-fairway bg-fairway-wash" : "border-flag bg-flag-wash",
          ].join(" ")}
          role="status"
        >
          {result.message}
        </p>
      )}

      {/* Column mapper (§4.1) */}
      {preview && !preview.ok && preview.needsMapping && (
        <section className="mt-6 hairline border-flag bg-paper-raised px-4 py-4">
          <h3 className="font-medium">{preview.message}</h3>
          <div className="mt-4 space-y-3">
            {preview.needsMapping.missing.map((field) => (
              <div key={field.key} className="flex flex-wrap items-center gap-3">
                <label htmlFor={`map-${field.key}`} className="w-40 text-sm font-medium">
                  {field.canonical}
                </label>
                <select
                  id={`map-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field.key]: Number(e.target.value) }))
                  }
                  className="hairline bg-paper px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a column…</option>
                  {preview.needsMapping!.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-graphite-ink">{field.help}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={
              pending ||
              preview.needsMapping.missing.some((f) => mapping[f.key] === undefined)
            }
            onClick={() => fileRef.current && upload(fileRef.current, mapping)}
            className="mt-4 bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink disabled:opacity-60"
          >
            Use these columns
          </button>
          <p className="mt-2 text-xs text-graphite-ink">
            We&apos;ll remember this so you only have to do it once.
          </p>
        </section>
      )}

      {preview && !preview.ok && !preview.needsMapping && preview.message && (
        <p className="mt-4 hairline border-flag bg-flag-wash px-4 py-3 text-sm" role="alert">
          {preview.message}
        </p>
      )}

      {/* Preview */}
      {preview?.ok && diff && (
        <div className="mt-8">
          <h2 className="text-xl">What will change</h2>
          <p className="tabular mt-1 text-lg">{preview.summary}</p>
          <p className="mt-1 text-sm text-graphite-ink">
            From <strong>{preview.filename}</strong>
            {preview.sheetName && ` · sheet "${preview.sheetName}"`} ·{" "}
            {diff.rowsRead.toLocaleString()} rows read
            {diff.rowsFailed > 0 && `, ${diff.rowsFailed} skipped`}
          </p>

          <dl className="mt-5 grid gap-px bg-sand sm:grid-cols-4">
            <Metric label="Units before" value={diff.unitsBefore} />
            <Metric label="Units after" value={diff.unitsAfter} />
            <Metric
              label="Change"
              value={diff.unitsAfter - diff.unitsBefore}
              signed
            />
            <Metric label="New styles" value={diff.stylesCreated} />
          </dl>

          {/* Absent SKUs — the panel that matters most (§4.2 step 3). */}
          {diff.absent.length > 0 && (
            <section className="mt-6 hairline border-flag bg-flag-wash px-4 py-4">
              <h3 className="font-medium">
                {diff.absent.length} {diff.absent.length === 1 ? "SKU is" : "SKUs are"} in
                the catalogue but not in this file
              </h3>
              <p className="mt-1 text-sm">
                {mode === "upsert" ? (
                  <>
                    They will be set to <strong>0</strong> and kept, so they come
                    back the next time you include them.
                  </>
                ) : (
                  <>
                    They will be set to <strong>0 and hidden</strong> from the
                    catalogue. Nothing is deleted — quote history keeps working.
                  </>
                )}
              </p>
              <p className="tabular mt-2 text-sm">
                {units(diff.absent.reduce((n, a) => n + a.quantity, 0))} of stock
                currently sits on these.
              </p>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm underline underline-offset-2">
                  Show them
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto scroll-x">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-flag-wash">
                      <tr className="text-left">
                        <th className="px-2 py-1">SKU</th>
                        <th className="px-2 py-1">Item</th>
                        <th className="px-2 py-1">Colour</th>
                        <th className="px-2 py-1 text-right">Qty now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.absent.map((a) => (
                        <tr key={a.sku} className="border-t border-sand">
                          <td className="px-2 py-1 tabular">{a.sku}</td>
                          <td className="px-2 py-1">{a.style_name}</td>
                          <td className="px-2 py-1">{a.colour}</td>
                          <td className="px-2 py-1 text-right tabular">{a.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}

          {/* Row-level problems (§4.2 step 3). */}
          {diff.issues.length > 0 && (
            <section className="mt-6 hairline bg-paper-raised px-4 py-4">
              <h3 className="font-medium">
                {(() => {
                  const errors = diff.issues.filter((i) => i.level === "error").length;
                  const warnings = diff.issues.filter((i) => i.level === "warning").length;
                  const parts: string[] = [];
                  if (errors) parts.push(`${errors} ${errors === 1 ? "problem" : "problems"}`);
                  if (warnings) {
                    parts.push(
                      `${warnings} ${warnings === 1 ? "thing" : "things"} to check`,
                    );
                  }
                  return parts.join(" · ");
                })()}
              </h3>
              <div className="mt-3 max-h-72 overflow-y-auto scroll-x">
                <ul className="space-y-1.5 text-sm">
                  {diff.issues.slice(0, 200).map((issue, i) => (
                    <li key={i} className="flex gap-2">
                      <span
                        className={[
                          "tabular shrink-0 text-xs px-1.5 py-0.5",
                          issue.level === "error"
                            ? "bg-flag text-paper"
                            : "bg-sand text-ink",
                        ].join(" ")}
                      >
                        {issue.rowNumber ? `Row ${issue.rowNumber}` : "Sheet"}
                      </span>
                      <span>
                        {issue.message}
                        {issue.relatedRows?.length ? (
                          <span className="text-graphite-ink">
                            {" "}
                            (see row{issue.relatedRows.length > 1 ? "s" : ""}{" "}
                            {issue.relatedRows.join(", ")})
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {diff.issues.length > 200 && (
                  <p className="mt-2 text-xs text-graphite-ink">
                    …and {diff.issues.length - 200} more.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Columns we guessed or ignored — transparency, not a problem. */}
          {(preview.inferred?.length || preview.ignored?.length) && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-graphite-ink">
                How we read your columns
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                {preview.inferred?.map((c) => (
                  <p key={c.header}>
                    <span className="tabular">{c.header}</span> → read as{" "}
                    <strong>{c.key.replace(/_/g, " ")}</strong>
                  </p>
                ))}
                {preview.ignored?.length ? (
                  <p className="text-graphite-ink">
                    Ignored: {preview.ignored.join(", ")}
                  </p>
                ) : null}
              </div>
            </details>
          )}

          {/* Mode (§4.2 step 4). Safe option preselected. */}
          <fieldset className="mt-8">
            <legend className="label-caps mb-2">What should happen</legend>

            <label className="flex gap-3 hairline bg-paper-raised px-4 py-3 cursor-pointer has-checked:border-fairway">
              <input
                type="radio"
                name="mode"
                value="upsert"
                checked={mode === "upsert"}
                onChange={() => {
                  setMode("upsert");
                  if (fileRef.current) upload(fileRef.current, mapping);
                }}
                className="mt-1 accent-[var(--color-fairway)]"
              />
              <span>
                <strong>Update quantities</strong>{" "}
                <span className="text-xs text-graphite-ink">(recommended)</span>
                <span className="block text-sm text-graphite-ink">
                  Sizes in this file are updated. Sizes not in it go to 0 but stay
                  on the site, ready to come back.
                </span>
              </span>
            </label>

            <label className="mt-2 flex gap-3 hairline bg-paper-raised px-4 py-3 cursor-pointer has-checked:border-flag">
              <input
                type="radio"
                name="mode"
                value="replace"
                checked={mode === "replace"}
                onChange={() => {
                  setMode("replace");
                  if (fileRef.current) upload(fileRef.current, mapping);
                }}
                className="mt-1 accent-[var(--color-flag)]"
              />
              <span>
                <strong>Full replace</strong>
                <span className="block text-sm text-graphite-ink">
                  Anything not in this file is hidden from the catalogue. Use this
                  only when the file is your complete stock list.
                </span>
              </span>
            </label>

            {mode === "replace" && (
              <div className="mt-3">
                <label htmlFor="confirm-replace" className="block text-sm mb-1">
                  Type <strong>REPLACE</strong> to confirm
                </label>
                <input
                  id="confirm-replace"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="hairline bg-paper px-3 py-2 tabular w-40 focus:outline-none focus:border-flag"
                />
              </div>
            )}
          </fieldset>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={
                pending || (mode === "replace" && confirmation.trim().toUpperCase() !== "REPLACE")
              }
              className={[
                "px-5 py-2.5 text-paper font-medium transition-colors duration-150 disabled:opacity-60",
                mode === "replace" ? "bg-flag hover:bg-flag-ink" : "bg-fairway hover:bg-ink",
              ].join(" ")}
            >
              {pending
                ? "Applying…"
                : mode === "replace"
                  ? "Replace the catalogue"
                  : "Apply this update"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setConfirmation("");
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="hairline px-5 py-2.5 hover:border-graphite transition-colors duration-150"
            >
              Cancel
            </button>
          </div>

          <p className="mt-3 text-xs text-graphite-ink">
            Every import can be rolled back for 30 days.
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  signed,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const display = signed && value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
  return (
    <div className="bg-paper-raised px-4 py-3">
      <dt className="label-caps">{label}</dt>
      <dd
        className={[
          "tabular mt-1 text-xl",
          signed && value < 0 ? "text-flag-ink" : signed && value > 0 ? "text-fairway" : "",
        ].join(" ")}
      >
        {display}
      </dd>
    </div>
  );
}
