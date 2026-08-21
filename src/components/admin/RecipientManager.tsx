"use client";

import { useState, useTransition } from "react";
import {
  addRecipient,
  removeRecipient,
  toggleRecipient,
} from "@/app/admin/actions";
import type { RecipientRow } from "@/app/admin/(protected)/recipients/page";

/**
 * Recipient management (spec §9).
 *
 * The "Send test message" button exists because §9 is explicit that the owner
 * must be able to verify a WhatsApp number himself rather than calling a
 * developer. When a channel is not connected, the panel says exactly what is
 * missing instead of failing quietly at the moment a real request arrives.
 */
export function RecipientManager({
  recipients,
  emailConfigured,
}: {
  recipients: RecipientRow[];
  emailConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Email-only by the owner's decision — quotes travel one channel, and the
  // page stays as simple as the job. (WhatsApp for BUYERS — the "message us"
  // button on confirmations — is a different feature and lives in Settings.)
  const emailRecipients = recipients.filter((r) => r.channel === "email");

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-8">
        <Channel
          title="Email"
          note="The system of record. Every request is emailed with a spreadsheet of the lines attached."
          configured={emailConfigured}
          missing="Nothing is being sent yet — set up the sending account under Settings → Email sending, then send yourself a test."
          recipients={emailRecipients}
          pending={pending}
          onToggle={(id, active) => startTransition(() => toggleRecipient(id, active))}
          onRemove={(id) => startTransition(() => removeRecipient(id))}
        />
      </div>

      <aside className="hairline bg-paper-raised px-4 py-4 lg:sticky lg:top-6">
        <h2 className="label-caps mb-3">Add someone</h2>
        <form
          action={(formData) =>
            startTransition(async () => {
              const res = await addRecipient(formData);
              setError(res.error ?? null);
            })
          }
        >
          <label htmlFor="name" className="label-caps block mb-1">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />

          <input type="hidden" name="channel" value="email" />

          <label htmlFor="value" className="label-caps mt-4 block mb-1">
            Email address
          </label>
          <input
            id="value"
            name="value"
            required
            type="email"
            placeholder="name@gmail.com"
            className="w-full hairline bg-paper px-3 py-2 text-sm tabular focus:outline-none focus:border-fairway"
          />

          {error && (
            <p className="mt-3 text-xs text-flag-ink" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-4 w-full bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add recipient"}
          </button>
        </form>
      </aside>
    </div>
  );
}

function Channel({
  title,
  note,
  configured,
  missing,
  recipients,
  pending,
  onToggle,
  onRemove,
  onTest,
}: {
  title: string;
  note: string;
  configured: boolean;
  missing: string;
  recipients: RecipientRow[];
  pending: boolean;
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
  onTest?: (value: string) => void;
}) {
  return (
    <section className="hairline bg-paper-raised">
      <header className="border-b border-sand px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{title}</h2>
          <span
            className={[
              "text-2xs font-semibold uppercase tracking-wider px-2 py-0.5",
              configured ? "bg-fairway text-paper" : "bg-sand text-ink",
            ].join(" ")}
          >
            {configured ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="mt-1 text-sm text-graphite-ink">{note}</p>
        {!configured && (
          <p className="mt-2 text-sm text-flag-ink">
            Nothing is being sent on this channel. {missing}
          </p>
        )}
      </header>

      {recipients.length === 0 ? (
        <p className="px-4 py-6 text-sm text-graphite-ink">
          Nobody is set up here yet.
        </p>
      ) : (
        <ul className="divide-y divide-sand">
          {recipients.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  checked={!!r.is_active}
                  disabled={pending}
                  onChange={(e) => onToggle(r.id, e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-fairway)]"
                />
                <span className="sr-only">
                  {r.is_active ? "Active" : "Paused"} — {r.name}
                </span>
              </label>

              <span className="min-w-0 flex-1">
                <span className={r.is_active ? "" : "text-graphite-ink"}>{r.name}</span>
                <span className="block tabular text-xs text-graphite-ink break-all">
                  {r.value}
                </span>
              </span>

              {onTest && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onTest(r.value)}
                  className="hairline px-3 py-1.5 text-xs hover:border-fairway transition-colors duration-150"
                >
                  Send test message
                </button>
              )}

              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(r.id)}
                className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
