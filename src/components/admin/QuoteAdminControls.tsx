"use client";

import { useState, useTransition } from "react";
import { saveQuoteDetails, setQuoteStatus, resendNotifications } from "@/app/admin/actions";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/domain/types";

/**
 * The controls the sales team actually uses on a request (spec §9): move it
 * through the pipeline, record what was quoted, keep an internal note, and
 * resend notifications when one did not land.
 */
export function QuoteAdminControls({
  id,
  status,
  quotedValue,
  internalNotes,
}: {
  id: string;
  status: QuoteStatus;
  quotedValue: number | null;
  internalNotes: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <h2 className="label-caps mb-3">Working on it</h2>

      <label htmlFor="status" className="label-caps block mb-1">
        Status
      </label>
      <select
        id="status"
        value={status}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => setQuoteStatus(id, e.target.value as QuoteStatus))
        }
        className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
      >
        {QUOTE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {QUOTE_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <form
        action={(formData) =>
          startTransition(async () => {
            await saveQuoteDetails(id, formData);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          })
        }
        className="mt-4"
      >
        <label htmlFor="quoted_value" className="label-caps block mb-1">
          What we quoted (AED)
        </label>
        <input
          id="quoted_value"
          name="quoted_value"
          inputMode="decimal"
          defaultValue={quotedValue ?? ""}
          placeholder="Enter once you've priced it"
          className="w-full hairline bg-paper px-3 py-2 tabular text-sm focus:outline-none focus:border-fairway"
        />

        <label htmlFor="internal_notes" className="label-caps mt-4 block mb-1">
          Internal notes
        </label>
        <textarea
          id="internal_notes"
          name="internal_notes"
          rows={4}
          defaultValue={internalNotes ?? ""}
          placeholder="Not shown to the buyer."
          className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-3 w-full bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-60"
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </form>

      <div className="mt-5 rule pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await resendNotifications(id);
              setResendMessage(res.message);
            })
          }
          className="w-full hairline px-3 py-2 text-sm hover:border-fairway transition-colors duration-150 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend notifications"}
        </button>
        {resendMessage && (
          <p className="mt-2 text-xs" role="status">
            {resendMessage}
          </p>
        )}
      </div>
    </section>
  );
}
