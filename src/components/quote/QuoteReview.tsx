"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { readLogoBoard } from "@/lib/logo-preview";
import {
  groupByArticle,
  removeArticle,
  setArticleBranding,
  setQuantity,
  totals,
  useCart,
  clearCart,
} from "@/lib/cart/store";
import { reviewCart, type ReviewState } from "@/app/actions/review";
import { submitQuoteRequest } from "@/app/actions/quote";
import { EmptyState } from "@/components/ui/EmptyState";
import { PRICE_NOTE, PRICE_ON_REQUEST, units } from "@/lib/format";
import { displayStyleName } from "@/lib/domain/display-name";
import { EMIRATES } from "@/lib/domain/types";
import { PHONE_COUNTRIES, trnHint } from "@/lib/validation/quote";
import { TurnstileField } from "@/components/quote/TurnstileField";

/**
 * The review and request screen (spec §7.2).
 *
 * Two things this screen must never do, both from §7.1 and §7.2:
 *   - Read as a checkout. The action is "Request a quote", the totals are
 *     labelled indicative, and no figure is presented as final.
 *   - Block the buyer. Stock that has moved is shown as information for the
 *     sales team, not as a validation error, and nothing here refuses to send.
 */
export function QuoteReview() {
  const cart = useCart();
  const router = useRouter();
  const [review, setReview] = useState<ReviewState | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [extraLogos, setExtraLogos] = useState<File[]>([]);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  /** Logos already placed in the on-product try-on — offered for attachment. */
  const [previewLogos, setPreviewLogos] = useState<{ id: string; dataUrl: string }[]>([]);
  const [attachPreviewLogos, setAttachPreviewLogos] = useState(true);

  useEffect(() => {
    try {
      const board = readLogoBoard(window.localStorage);
      setPreviewLogos(board.logos.map((l) => ({ id: l.id, dataUrl: l.dataUrl })));
    } catch {
      /* no preview logos is the normal case */
    }
  }, []);
  const [trn, setTrn] = useState("");

  const groups = useMemo(() => groupByArticle(cart), [cart]);
  const cartTotals = totals(cart);

  // Re-check every line against current stock, server-side (§6.4).
  useEffect(() => {
    if (cart.lines.length === 0) {
      setReview(null);
      return;
    }
    startTransition(async () => {
      setReview(
        await reviewCart(cart.lines.map((l) => ({ sku: l.sku, quantity: l.quantity }))),
      );
    });
    // Re-run when the set of lines or their quantities changes, not on every
    // keystroke elsewhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.lines.map((l) => `${l.sku}:${l.quantity}`).join("|")]);

  const stateBySku = useMemo(() => {
    const map = new Map<string, ReviewState["lines"][number]>();
    for (const l of review?.lines ?? []) map.set(l.sku, l);
    return map;
  }, [review]);

  const flagged = (review?.lines ?? []).filter((l) => l.flag);

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        title="No sizes selected yet."
        body="Enter quantities on any product to begin."
        action={{ href: "/catalogue", label: "Browse the catalogue" }}
      />
    );
  }

  const onLogoChange = (file: File | null) => {
    setLogo(file);
    setLogoWarning(null);
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setLogoWarning("That file is over 25 MB. Send it to us by email instead and we'll attach it.");
      return;
    }
    const isVector = /\.(ai|eps|pdf|svg)$/i.test(file.name);
    if (!isVector) {
      // Accept and warn, never reject (§8).
      setLogoWarning(
        "We can work from this. Vector artwork (.ai, .eps, .pdf or .svg) reproduces better — if you have it, send that instead and we'll use it.",
      );
    }
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    formData.set(
      "lines",
      JSON.stringify(
        cart.lines.map((l) => ({
          sku: l.sku,
          article_number: l.article_number,
          size: l.size,
          quantity: l.quantity,
          branding: l.branding,
        })),
      ),
    );
    if (logo) formData.set("logo", logo);
    for (const extra of extraLogos) formData.append("logos", extra);
    if (attachPreviewLogos && previewLogos.length) {
      for (const [i, pl] of previewLogos.entries()) {
        try {
          const blob = await (await fetch(pl.dataUrl)).blob();
          formData.append(
            "logos",
            new File([blob], `preview-logo-${i + 1}.png`, { type: blob.type || "image/png" }),
          );
        } catch {
          /* a preview logo that fails to read is silently skipped */
        }
      }
    }

    const result = await submitQuoteRequest(formData);
    setSubmitting(false);

    if (result.ok && result.reference) {
      clearCart();
      router.push(`/quote/${result.reference}`);
      return;
    }
    setErrors(result.errors ?? {});
    setFormError(result.message ?? "Something went wrong. Try again.");
    // Put the buyer where the problem is rather than leaving them at the bottom
    // of a long form wondering what happened.
    document.getElementById("quote-details")?.scrollIntoView({ behavior: "smooth" });
  }

  const hint = trnHint(trn);

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* Honeypot. Off-screen, not display:none, and never focusable by tab.
          Named so password managers will not autofill it. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="fax_number_hp">Leave this field empty</label>
        <input
          id="fax_number_hp"
          name="fax_number_hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="min-w-0">
        {/* Stock movement, stated once at the top as information (§7.2). */}
        {flagged.length > 0 && (
          <div className="hairline border-flag bg-flag-wash px-4 py-3 mb-6" role="status">
            <p className="font-medium">
              Availability has moved on {flagged.length}{" "}
              {flagged.length === 1 ? "line" : "lines"} since you added them.
            </p>
            <p className="mt-1 text-sm">
              You can still send this. We&apos;ll confirm what we can supply, and
              what we can get in for your date, when we come back to you.
            </p>
          </div>
        )}

        <h2 className="label-caps mb-3">Your order</h2>

        <div className="space-y-8">
          {groups.map((group) => {
            const lead = group.lines[0];
            const category = stateBySku.get(lead.sku)?.category ?? "accessories";
            const placements = review?.placementsByCategory[category] ?? [];
            const branded = (lead.branding?.placements.length ?? 0) > 0;
            const minUnits = review?.brandingMinUnits ?? 12;

            return (
              <section key={group.article_number} className="hairline bg-paper-raised">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-graphite-ink">{lead.brand}</p>
                    <h3 className="font-medium">
                      <Link
                        href={`/product/${encodeURIComponent(group.article_number)}`}
                        className="hover:text-fairway"
                      >
                        {displayStyleName(lead.style_name)}
                      </Link>
                    </h3>
                    <p className="text-sm text-graphite-ink">
                      {lead.colour}
                      <span className="tabular"> · Art. {group.article_number}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeArticle(group.article_number)}
                    className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
                  >
                    Remove this style
                  </button>
                </header>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand">
                      <th scope="col" className="px-4 py-2 text-left label-caps">Size</th>
                      <th scope="col" className="px-4 py-2 text-right label-caps">Qty</th>
                      <th scope="col" className="px-2 py-2 text-right">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line) => (
                        <tr key={line.sku} className="border-b border-sand last:border-0">
                          <td className="px-4 py-2 tabular">{line.size}</td>
                          <td className="px-4 py-2 text-right">
                            <label className="sr-only" htmlFor={`qty-${line.sku}`}>
                              Quantity of {displayStyleName(line.style_name)} size {line.size}
                            </label>
                            <input
                              id={`qty-${line.sku}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={line.quantity}
                              onChange={(e) =>
                                setQuantity({ sku: line.sku, quantity: Number(e.target.value) })
                              }
                              className="w-20 hairline bg-paper px-2 py-1 text-right focus:outline-none focus:border-fairway"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setQuantity({ sku: line.sku, quantity: 0 })}
                              aria-label={`Remove size ${line.size}`}
                              className="text-graphite-ink hover:text-flag-ink px-1"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>

                {group.lines.some((l) => stateBySku.get(l.sku)?.flag) && (
                  <ul className="border-t border-sand px-4 py-2 space-y-1">
                    {group.lines.map((l) => {
                      const flag = stateBySku.get(l.sku)?.flag;
                      if (!flag) return null;
                      return (
                        <li key={l.sku} className="text-xs text-flag-ink">
                          <span className="tabular">Size {l.size}</span> — {flag}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Branding, per line — a company routinely brands the polos and
                    caps and leaves the balls plain (§8). */}
                {placements.length > 0 && (
                  <div className="border-t border-sand px-4 py-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={branded}
                        onChange={(e) =>
                          setArticleBranding(
                            group.article_number,
                            e.target.checked ? { placements: [placements[0]] } : undefined,
                          )
                        }
                        className="h-4 w-4 accent-[var(--color-fairway)]"
                      />
                      <span className="font-medium">Add our logo to this item</span>
                    </label>

                    {branded && (
                      <div className="mt-3 pl-6">
                        <fieldset>
                          <legend className="label-caps mb-2">Placement</legend>
                          <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {placements.map((p) => {
                              const checked = lead.branding?.placements.includes(p) ?? false;
                              return (
                                <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const current = lead.branding?.placements ?? [];
                                      const next = checked
                                        ? current.filter((x) => x !== p)
                                        : [...current, p];
                                      setArticleBranding(
                                        group.article_number,
                                        next.length ? { placements: next } : undefined,
                                      );
                                    }}
                                    className="h-4 w-4 accent-[var(--color-fairway)]"
                                  />
                                  {p}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>

                        <p className="mt-2 text-xs text-graphite-ink">
                          Branding quoted separately.
                        </p>

                        {/* Warn below the minimum, never block (§8). */}
                        {group.units < minUnits && (
                          <p className="mt-1 text-xs text-graphite-ink">
                            Most branded runs start at {minUnits} units — we&apos;ll
                            confirm what&apos;s possible.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <footer className="border-t border-sand px-4 py-2 text-sm text-graphite-ink">
                  {units(group.units)}
                </footer>
              </section>
            );
          })}
        </div>

        {/* Logo upload — always offered, not gated behind a per-line tick.
            A buyer sending kit "with our logo on it" should never have to
            hunt for where the logo goes. */}
        <section className="mt-8 hairline bg-paper-raised px-4 py-4">
            <h2 className="label-caps mb-2">Your logo / artwork</h2>
            <p className="text-sm text-graphite-ink mb-3">
              {cartTotals.hasBranding
                ? "Upload once and we'll use it on every item you've branded. Vector files reproduce best. Your artwork is stored privately and only seen by our team."
                : "Want your logo on any of this? Attach it here and tell us where — we'll price the branding with the quote. Optional; stored privately and only seen by our team."}
            </p>
            {previewLogos.length > 0 && (
              <label className="mb-3 flex items-start gap-2.5 border border-fairway-wash bg-fairway-wash px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={attachPreviewLogos}
                  onChange={(e) => setAttachPreviewLogos(e.target.checked)}
                  className="mt-0.5 accent-[var(--color-fairway)]"
                />
                <span>
                  <span className="font-medium">
                    Attach the {previewLogos.length === 1 ? "logo" : `${previewLogos.length} logos`} from your product preview
                  </span>
                  <span className="mt-1 flex gap-2">
                    {previewLogos.slice(0, 6).map((pl) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={pl.id} src={pl.dataUrl} alt="" className="h-8 w-8 border border-sand bg-paper object-contain" />
                    ))}
                  </span>
                  <span className="mt-1 block text-xs text-graphite-ink">
                    Preview quality — attach the original files below too if you have them.
                  </span>
                </span>
              </label>
            )}
            <input
              type="file"
              name="logo_input"
              accept=".ai,.eps,.pdf,.svg,.png,.jpg,.jpeg"
              onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:border file:border-sand file:bg-paper file:px-3 file:py-1.5 file:text-sm"
            />
            <label className="mt-3 block text-sm">
              <span className="font-medium">Add another logo</span>
              <span className="block text-xs text-graphite-ink mb-1">
                Chest and back, or two marks — attach every file you want on this request.
              </span>
              <input
                type="file"
                multiple
                accept=".ai,.eps,.pdf,.svg,.png,.jpg,.jpeg"
                onChange={(e) => setExtraLogos(Array.from(e.target.files ?? []))}
                className="block w-full text-sm file:mr-3 file:border file:border-sand file:bg-paper file:px-3 file:py-1.5 file:text-sm"
              />
            </label>
            {(logo || extraLogos.length > 0) && (
              <p className="mt-2 text-xs text-graphite-ink">
                {[logo, ...extraLogos].filter(Boolean).length} logo
                {[logo, ...extraLogos].filter(Boolean).length === 1 ? "" : "s"} attached.
              </p>
            )}
            {logoWarning && (
              <p className="mt-2 text-xs text-graphite-ink" role="status">
                {logoWarning}
              </p>
            )}
            <label htmlFor="logo_notes" className="label-caps mt-4 block mb-1">
              Artwork notes
            </label>
            <textarea
              id="logo_notes"
              name="logo_notes"
              rows={2}
              placeholder="Thread or print colours, Pantone references, sizing."
              className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
            />
          </section>

        {/* Contact details */}
        <section id="quote-details" className="mt-10">
          <h2 className="label-caps mb-3">Your details</h2>

          {formError && (
            <p
              className="hairline border-flag bg-flag-wash px-4 py-3 mb-4 text-sm"
              role="alert"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Company name"
              name="company_name"
              required
              error={errors.company_name}
              className="sm:col-span-2"
            />

            <div>
              <label htmlFor="trn" className="label-caps block mb-1">
                TRN <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="trn"
                name="trn"
                value={trn}
                onChange={(e) => setTrn(e.target.value)}
                inputMode="numeric"
                className="w-full hairline bg-paper-raised px-3 py-2 tabular focus:outline-none focus:border-fairway"
              />
              <p className="mt-1 text-xs text-graphite-ink">
                {hint ?? "Only if you have it to hand — it won't hold up your quote."}
              </p>
            </div>

            <Field label="Your name" name="contact_name" required error={errors.contact_name} />
            <Field label="Your role" name="contact_role" placeholder="Marketing Manager" />
            <Field label="Email" name="email" type="email" required error={errors.email} />

            <div>
              <label htmlFor="phone" className="label-caps block mb-1">
                Phone
              </label>
              <div className="flex">
                <label htmlFor="phone_country" className="sr-only">
                  Country code
                </label>
                <select
                  id="phone_country"
                  name="phone_country"
                  defaultValue="+971"
                  className="hairline border-r-0 bg-paper-raised px-2 py-2 tabular text-sm focus:outline-none focus:border-fairway"
                >
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  className="flex-1 min-w-0 hairline bg-paper-raised px-3 py-2 tabular focus:outline-none focus:border-fairway"
                />
              </div>
              {errors.phone && (
                <p className="mt-1 text-xs text-flag-ink" role="alert">
                  {errors.phone}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="delivery_emirate" className="label-caps block mb-1">
                Deliver to
              </label>
              <select
                id="delivery_emirate"
                name="delivery_emirate"
                required
                defaultValue="Dubai"
                className="w-full hairline bg-paper-raised px-3 py-2 focus:outline-none focus:border-fairway"
              >
                {EMIRATES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              {errors.delivery_emirate && (
                <p className="mt-1 text-xs text-flag-ink" role="alert">
                  {errors.delivery_emirate}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="required_by" className="label-caps block mb-1">
                Needed by <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="required_by"
                name="required_by"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                className="w-full hairline bg-paper-raised px-3 py-2 tabular focus:outline-none focus:border-fairway"
              />
              <p className="mt-1 text-xs text-graphite-ink">
                A golf day has a fixed date. Telling us yours changes what we
                offer.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="notes" className="label-caps block mb-1">
                Anything else
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={4}
                placeholder="What the kit is for, sizing preferences, anything we should know."
                className="w-full hairline bg-paper-raised px-3 py-2 text-sm focus:outline-none focus:border-fairway"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Summary rail */}
      <aside className="lg:sticky lg:top-24">
        <div className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Summary</h2>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-graphite-ink">Units</dt>
              <dd className="tabular font-medium">{cartTotals.units.toLocaleString("en-AE")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-graphite-ink">Lines</dt>
              <dd className="tabular">{cartTotals.lines}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-graphite-ink">Styles</dt>
              <dd className="tabular">{cartTotals.articles}</dd>
            </div>
            {cartTotals.hasBranding && (
              <div className="flex justify-between gap-4">
                <dt className="text-graphite-ink">Branded styles</dt>
                <dd className="tabular">{cartTotals.brandedLines}</dd>
              </div>
            )}
            <div className="rule pt-3">
              <dt className="font-medium">Price</dt>
              <dd className="mt-1 text-graphite-ink">{PRICE_ON_REQUEST}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-graphite-ink">{PRICE_NOTE}</p>
          {cartTotals.hasBranding && (
            <p className="mt-1 text-xs text-graphite-ink">Branding quoted separately.</p>
          )}

          <TurnstileField />

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-5 w-full text-center disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Request a quote"}
          </button>

          <p className="mt-3 text-xs text-graphite-ink">
            This sends a request, not an order. Nothing is charged and nothing is
            reserved. We&apos;ll come back to you within{" "}
            {review?.responseHours ?? 24} hours with a price.
          </p>

          {pending && (
            <p className="mt-2 text-xs text-graphite-ink" role="status">
              Checking current availability…
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}

/* -------------------------------------------------------------------------
   Field
   ---------------------------------------------------------------------- */

function Field({
  label,
  name,
  type = "text",
  required,
  error,
  placeholder,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label-caps block mb-1">
        {label}
        {!required && <span className="normal-case tracking-normal"> (optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className="w-full hairline bg-paper-raised px-3 py-2 focus:outline-none focus:border-fairway aria-[invalid]:border-flag"
      />
      {error && (
        <p id={`${name}-error`} className="mt-1 text-xs text-flag-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
