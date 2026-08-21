"use client";

import { useState, useTransition } from "react";
import {
  addRecipient,
  removeRecipient,
  testWhatsApp,
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
  whatsappConfigured,
}: {
  recipients: RecipientRow[];
  emailConfigured: boolean;
  whatsappConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");

  const byChannel = (c: "email" | "whatsapp") => recipients.filter((r) => r.channel === c);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-8">
        <Channel
          title="Email"
          note="The system of record. Every request is emailed with a CSV of the lines attached."
          configured={emailConfigured}
          missing="Add RESEND_API_KEY and ORDER_FROM_EMAIL to the environment to turn this on."
          recipients={byChannel("email")}
          pending={pending}
          onToggle={(id, active) => startTransition(() => toggleRecipient(id, active))}
          onRemove={(id) => startTransition(() => removeRecipient(id))}
        />

        <Channel
          title="WhatsApp"
          note="A short headline so someone picks the request up fast. Each number must have opted in to messages from the business number first."
          configured={whatsappConfigured}
          missing="Needs a verified Meta Business account, a dedicated sender number, and an approved template under the utility category."
          recipients={byChannel("whatsapp")}
          pending={pending}
          onToggle={(id, active) => startTransition(() => toggleRecipient(id, active))}
          onRemove={(id) => startTransition(() => removeRecipient(id))}
          onTest={(value) =>
            startTransition(async () => {
              const res = await testWhatsApp(value);
              setTestMessage(res.message);
            })
          }
        />

        {testMessage && (
          <p className="hairline bg-paper-raised px-4 py-3 text-sm" role="status">
            {testMessage}
          </p>
        )}
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

          <fieldset className="mt-4">
            <legend className="label-caps mb-1">Channel</legend>
            <div className="flex gap-4">
              {(["email", "whatsapp"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="channel"
                    value={c}
                    checked={channel === c}
                    onChange={() => setChannel(c)}
                    className="accent-[var(--color-fairway)]"
                  />
                  {c === "email" ? "Email" : "WhatsApp"}
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="value" className="label-caps mt-4 block mb-1">
            {channel === "email" ? "Email address" : "WhatsApp number"}
          </label>
          <input
            id="value"
            name="value"
            required
            type={channel === "email" ? "email" : "tel"}
            placeholder={channel === "email" ? "name@pinhighuae.com" : "+971501234567"}
            className="w-full hairline bg-paper px-3 py-2 text-sm tabular focus:outline-none focus:border-fairway"
          />
          {channel === "whatsapp" && (
            <p className="mt-1 text-xs text-graphite-ink">
              Full international format, including the country code.
            </p>
          )}

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
