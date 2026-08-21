"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { saveProduct, setProductVisibility } from "@/app/admin/actions";
import type { AdminProductRow } from "@/app/admin/(protected)/products/page";
import type { ProductImageRow } from "@/lib/repo/images";
import { ImageManager } from "./ImageManager";
import { amount } from "@/lib/format";
import { CATEGORY_LABELS, type Category } from "@/lib/domain/types";

/**
 * Product list with inline editing and bulk visibility (spec §9).
 *
 * The row expands into an editor rather than navigating to a detail page — the
 * owner's common task is correcting one price or hiding one colourway, and a
 * round trip per edit is what makes an admin panel feel like a chore.
 */
export function ProductTable({
  products,
  imagesByProduct,
}: {
  products: AdminProductRow[];
  imagesByProduct: Record<string, ProductImageRow[]>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (products.length === 0) {
    return (
      <p className="hairline bg-paper-raised px-4 py-8 text-center text-sm text-graphite-ink">
        No products match those filters.
      </p>
    );
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="hairline bg-fairway-wash px-4 py-3 mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="tabular font-medium">{selected.size} selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setProductVisibility([...selected], true);
                setSelected(new Set());
              })
            }
            className="hairline bg-paper px-3 py-1.5 hover:border-fairway"
          >
            Show on site
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setProductVisibility([...selected], false);
                setSelected(new Set());
              })
            }
            className="hairline bg-paper px-3 py-1.5 hover:border-flag hover:text-flag-ink"
          >
            Hide from site
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-graphite-ink underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      )}

      <div className="hairline bg-paper-raised overflow-x-auto scroll-x">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="border-b border-sand text-left">
              <th className="px-3 py-2 w-8">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-2 label-caps">Article</th>
              <th className="px-3 py-2 label-caps">Brand</th>
              <th className="px-3 py-2 label-caps">Style</th>
              <th className="px-3 py-2 label-caps">Colour</th>
              <th className="px-3 py-2 label-caps">Category</th>
              <th className="px-3 py-2 label-caps text-right">Stock</th>
              <th className="px-3 py-2 label-caps text-right">Price</th>
              <th className="px-3 py-2 label-caps text-right">Images</th>
              <th className="px-3 py-2 label-caps">On site</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-b border-sand">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.style_name} in ${p.colour}`}
                      className="h-4 w-4 accent-[var(--color-fairway)]"
                    />
                  </td>
                  <td className="px-3 py-2 tabular">
                    <Link
                      href={`/product/${encodeURIComponent(p.article_number)}`}
                      target="_blank"
                      className="underline underline-offset-2 hover:text-fairway"
                    >
                      {p.article_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{p.brand}</td>
                  <td className="px-3 py-2 max-w-[18rem] truncate" title={p.style_name}>
                    {p.style_name}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 border border-sand shrink-0"
                        style={{ backgroundColor: p.colour_hex ?? "transparent" }}
                        aria-hidden="true"
                      />
                      {p.colour}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {CATEGORY_LABELS[p.category as Category] ?? p.category}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {p.total_quantity === 0 ? (
                      <span className="text-flag-ink">0</span>
                    ) : (
                      p.total_quantity
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {amount(p.price_wholesale)}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {p.image_count === 0 ? (
                      <span className="text-graphite-ink">—</span>
                    ) : (
                      p.image_count
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {p.is_visible ? (
                      <span className="text-fairway">Yes</span>
                    ) : (
                      <span className="text-graphite-ink">Hidden</span>
                    )}
                    {p.condition !== "new" && (
                      <span className="block text-2xs text-flag-ink uppercase tracking-wider">
                        {p.condition}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === p.id ? null : p.id)}
                      className="text-xs underline underline-offset-2 hover:text-fairway"
                    >
                      {editing === p.id ? "Close" : "Edit"}
                    </button>
                  </td>
                </tr>

                {editing === p.id && (
                  <tr className="border-b border-sand bg-paper">
                    <td colSpan={11} className="px-4 py-4">
                      <form
                        action={(formData) =>
                          startTransition(async () => {
                            await saveProduct(p.id, formData);
                            setEditing(null);
                          })
                        }
                        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                      >
                        <Input label="Style name" name="style_name" defaultValue={p.style_name} className="lg:col-span-2" />
                        <Input label="Season" name="season" defaultValue={p.season ?? ""} />
                        <Input label="Swatch hex" name="colour_hex" defaultValue={p.colour_hex ?? ""} placeholder="#1B2A4A" />

                        <Input label="Fabric" name="fabric" defaultValue={p.fabric ?? ""} className="lg:col-span-2" />
                        <Input label="Corporate price (AED)" name="price_wholesale" defaultValue={p.price_wholesale ?? ""} numeric />
                        <Input label="Retail price (AED)" name="rrp" defaultValue={p.rrp ?? ""} numeric />

                        <Input label="Case pack" name="case_pack" defaultValue={p.case_pack ?? ""} numeric />
                        <Input label="MOQ" name="moq" defaultValue={p.moq ?? ""} numeric />
                        <Input label="Sort order" name="sort_order" defaultValue={p.sort_order} numeric />

                        <div className="flex items-end gap-4 pb-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="is_visible"
                              defaultChecked={!!p.is_visible}
                              className="h-4 w-4 accent-[var(--color-fairway)]"
                            />
                            On site
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="is_discontinued"
                              defaultChecked={!!p.is_discontinued}
                              className="h-4 w-4 accent-[var(--color-fairway)]"
                            />
                            Discontinued
                          </label>
                        </div>

                        <div className="lg:col-span-4">
                          <label htmlFor={`desc-${p.id}`} className="label-caps block mb-1">
                            Description
                          </label>
                          <textarea
                            id={`desc-${p.id}`}
                            name="description"
                            rows={3}
                            defaultValue={p.description ?? ""}
                            className="w-full hairline bg-paper-raised px-3 py-2 text-sm focus:outline-none focus:border-fairway"
                          />
                        </div>

                        <div className="lg:col-span-4 rule pt-4">
                          <p className="label-caps mb-2">Photos</p>
                          <ImageManager
                            productId={p.id}
                            articleNumber={p.article_number}
                            images={imagesByProduct[p.id] ?? []}
                          />
                        </div>

                        <div className="lg:col-span-4 flex gap-3">
                          <button
                            type="submit"
                            disabled={pending}
                            className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink disabled:opacity-60"
                          >
                            {pending ? "Saving…" : "Save changes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="hairline px-4 py-2 text-sm hover:border-graphite"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Input({
  label,
  name,
  defaultValue,
  placeholder,
  numeric,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label-caps block mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        className={`w-full hairline bg-paper-raised px-3 py-2 text-sm focus:outline-none focus:border-fairway ${
          numeric ? "tabular" : ""
        }`}
      />
    </div>
  );
}
