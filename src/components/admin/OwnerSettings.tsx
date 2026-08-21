"use client";

import { useState, useTransition } from "react";
import {
  saveGmailSettings,
  clearGmailSettings,
  sendTestEmailAction,
  changeAdminPassword,
} from "@/app/admin/actions";

/**
 * The two things the owner manages without the developer: where quote
 * notifications send from, and the admin password. Both were env-only —
 * which meant handing credentials to whoever runs the deployment. Now the
 * owner types them straight into the panel and nobody else touches them.
 */

function Notice({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={`mt-2 text-xs ${result.ok ? "text-fairway" : "text-flag-ink"}`}
    >
      {result.message}
    </p>
  );
}

export function GmailSettings({
  transport,
  sender,
  canStore,
}: {
  transport: "resend" | "gmail-admin" | "gmail-env" | "none";
  sender: string | null;
  canStore: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const status =
    transport === "none"
      ? "Not set up yet — quote requests are saved but nobody is emailed."
      : transport === "resend"
        ? `Sending via the site's own domain (${sender}).`
        : `Sending as ${sender}.`;

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <h2 className="label-caps mb-1">Email sending — Gmail</h2>
      <p className="text-xs text-graphite-ink">{status}</p>

      <form
        method="post"
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(async () => setResult(await saveGmailSettings(data)));
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">Gmail address</span>
          <input
            name="gmail_user"
            type="email"
            autoComplete="off"
            defaultValue={transport === "gmail-admin" ? (sender ?? "") : ""}
            placeholder="pinhigh.quotes@gmail.com"
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">App password</span>
          <input
            name="gmail_app_password"
            type="password"
            autoComplete="new-password"
            placeholder={transport === "gmail-admin" ? "•••• saved — enter to replace" : "16 characters from Google"}
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </label>
        <p className="text-xs text-graphite-ink sm:col-span-2">
          Not the normal Gmail password: in the Google Account go to Security →
          2-Step Verification → App passwords, create one for “Mail”, and paste
          the 16-character code here. It is stored encrypted and never shown
          again. Who <em>receives</em> quotes is set on the Recipients page.
        </p>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pending || !canStore}
            className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save Gmail details"}
          </button>
          {transport === "gmail-admin" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setResult(await clearGmailSettings()))}
              className="text-xs text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
            >
              Remove
            </button>
          )}
        </div>
        {!canStore && (
          <p className="text-xs text-flag-ink sm:col-span-2">
            The deployment is missing ADMIN_SESSION_SECRET, so secrets can’t be
            stored yet — ask your developer to set it.
          </p>
        )}
      </form>
      <Notice result={result} />

      <form
        method="post"
        className="mt-5 flex flex-wrap items-end gap-3 border-t border-sand pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(async () => setTestResult(await sendTestEmailAction(data)));
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">Send a test to</span>
          <input
            name="to"
            type="email"
            placeholder="you@gmail.com"
            className="w-64 hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="hairline px-4 py-2 text-sm hover:border-fairway disabled:opacity-50"
        >
          Send test email
        </button>
      </form>
      <Notice result={testResult} />
    </section>
  );
}

export function PasswordSettings({ hasOwnPassword }: { hasOwnPassword: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <h2 className="label-caps mb-1">Admin password</h2>
      <p className="text-xs text-graphite-ink">
        {hasOwnPassword
          ? "You have set your own password. Only it signs in."
          : "You are still on the password the site was set up with — change it to one only you know."}
      </p>

      <form
        method="post"
        className="mt-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          start(async () => {
            const res = await changeAdminPassword(data);
            setResult(res);
            if (res.ok) form.reset();
          });
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">Current password</span>
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">New password</span>
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium">New password again</span>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-50"
          >
            {pending ? "Changing…" : "Change password"}
          </button>
          <span className="ml-3 text-xs text-graphite-ink">At least 12 characters.</span>
        </div>
      </form>
      <Notice result={result} />
    </section>
  );
}
