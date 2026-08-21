"use client";

import { useState } from "react";
import { captureStockAlert } from "@/app/actions/quote";

/**
 * "Email me when back" (spec §4.3).
 *
 * A style whose sizes all hit 0 stays visible and captures interest rather
 * than disappearing. For a corporate catalogue this is worth more than it
 * sounds — the buyer planning a golf day in March is a lead now, whatever the
 * stock says today.
 */
export function StockAlertForm({ articleNumber }: { articleNumber: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (state?.ok) {
    return (
      <p className="hairline bg-fairway-wash px-4 py-3 text-sm" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form
      className="hairline bg-paper-raised px-4 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setState(await captureStockAlert(articleNumber, email));
        setPending(false);
      }}
    >
      <label htmlFor={`alert-${articleNumber}`} className="label-caps block mb-1">
        Out of stock — tell me when it&apos;s back
      </label>
      <p className="text-sm text-graphite-ink mb-3">
        We restock regularly. If you need this for a fixed date, contact us and
        we&apos;ll tell you what we can get.
      </p>
      <div className="flex gap-2">
        <input
          id={`alert-${articleNumber}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.ae"
          className="flex-1 hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Notify me"}
        </button>
      </div>
      {state && !state.ok && (
        <p className="mt-2 text-xs text-flag-ink" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
