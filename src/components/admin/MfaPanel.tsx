"use client";

import { useState, useTransition } from "react";
import { confirmMfaSetup, newRecoveryCodes, startMfaSetup } from "@/app/admin/actions";

/**
 * Authenticator setup and recovery codes (spec §2).
 *
 * Written for someone who has never used an authenticator app: what to
 * install, what to scan, what to keep. The recovery codes are shown exactly
 * once and the page insists they are saved before moving on.
 */
export function MfaPanel({
  enabled,
  available,
  recoveryRemaining,
  enrolment,
}: {
  enabled: boolean;
  available: boolean;
  recoveryRemaining: number;
  enrolment: { qrSvg: string; manualKey: string } | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  if (codes) {
    return (
      <section className="hairline bg-paper-raised px-4 py-4">
        <h2 className="label-caps mb-1">Your recovery codes</h2>
        <p className="text-sm">
          <strong>Save these now — they are shown once.</strong> Each one signs
          you in once if you lose your phone. Print them or keep them in a
          password manager. Anyone with a code and your password can get in, so
          treat them like keys.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 tabular text-sm print:grid-cols-2">
          {codes.map((c) => (
            <li key={c} className="bg-paper px-3 py-2 select-all">
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="hairline px-4 py-2 text-sm hover:border-fairway"
          >
            Print
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codes.join("\n"));
              } catch {
                /* selectable either way */
              }
            }}
            className="hairline px-4 py-2 text-sm hover:border-fairway"
          >
            Copy all
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-fairway)]"
            />
            I’ve saved these somewhere safe
          </label>
          <a
            href="/admin"
            aria-disabled={!saved}
            onClick={(e) => {
              if (!saved) e.preventDefault();
            }}
            className={`bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 ${
              saved ? "" : "opacity-50 cursor-not-allowed"
            }`}
          >
            Continue to the dashboard
          </a>
        </div>
      </section>
    );
  }

  if (enabled) {
    return (
      <section className="hairline bg-paper-raised px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="label-caps">Authenticator app</h2>
          <span className="text-2xs font-semibold uppercase tracking-wider bg-fairway text-paper px-2 py-0.5">
            On
          </span>
        </div>
        <p className="mt-2 text-sm">
          You have <strong>{recoveryRemaining}</strong> recovery{" "}
          {recoveryRemaining === 1 ? "code" : "codes"} left.
          {recoveryRemaining <= 2 && (
            <span className="text-flag-ink"> That’s getting low — get a new set.</span>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await newRecoveryCodes();
                if (res.ok) {
                  setCodes(res.recoveryCodes);
                  setSaved(false);
                } else setError(res.message);
              })
            }
            className="hairline px-4 py-2 text-sm hover:border-fairway disabled:opacity-50"
          >
            Get new recovery codes
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Replace the authenticator? The current one stops working once the new one is confirmed.")) {
                start(async () => {
                  const res = await startMfaSetup();
                  if (!res.ok) setError(res.message ?? "Couldn't start.");
                });
              }
            }}
            className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
          >
            New phone? Replace the authenticator
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-flag-ink" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (!available) {
    return (
      <section className="hairline border-flag bg-flag-wash px-4 py-4">
        <h2 className="label-caps mb-1">Authenticator app</h2>
        <p className="text-sm">
          This deployment can’t store an authenticator yet because
          ADMIN_SESSION_SECRET is not set. Ask your developer to add it (any 32+
          random characters) in Vercel → Settings → Environment Variables and
          redeploy, then come back here.
        </p>
      </section>
    );
  }

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <h2 className="label-caps mb-1">Set up your authenticator app</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
        <li>
          On your phone, install an authenticator app if you don’t have one:{" "}
          <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong>{" "}
          (both free, App Store or Google Play). 1Password and Bitwarden work too.
        </li>
        <li>In the app, choose “Add” or “+”, then “Scan a QR code”, and point it at this:</li>
      </ol>

      {enrolment && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
          <div
            className="w-48 bg-white p-2 hairline"
            aria-label="QR code for your authenticator app"
            dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
          />
          <div className="text-sm">
            <p className="text-graphite-ink">
              Can’t scan? Choose “Enter a setup key” and type this, with “Pin
              High UAE” as the name:
            </p>
            <p className="mt-2 tabular bg-paper px-3 py-2 select-all break-all">{enrolment.manualKey}</p>
          </div>
        </div>
      )}

      <form
        className="mt-5 border-t border-sand pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(async () => {
            const res = await confirmMfaSetup(data);
            if (res.ok) {
              setError(null);
              setCodes(res.recoveryCodes);
              setSaved(false);
            } else setError(res.message);
          });
        }}
      >
        <p className="text-sm">3. The app now shows a six-digit code for Pin High. Type it here:</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123 456"
            className="w-40 hairline bg-paper px-3 py-2 tabular text-lg tracking-widest focus:outline-none focus:border-fairway"
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-50"
          >
            {pending ? "Checking…" : "Turn on"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-flag-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
