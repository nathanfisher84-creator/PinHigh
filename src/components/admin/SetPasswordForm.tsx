"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { redeemAccountToken } from "@/app/admin/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full bg-fairway px-4 py-3 text-paper font-medium hover:bg-ink transition-colors duration-150 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function SetPasswordForm({
  token,
  purpose,
  email,
}: {
  token: string;
  purpose: "invite" | "reset";
  email: string;
}) {
  const [state, formAction] = useActionState(redeemAccountToken, null);

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="purpose" value={purpose} />
      {/* Lets a password manager file the entry under the right account. */}
      <input type="hidden" name="username" value={email} autoComplete="username" />

      <label htmlFor="password" className="label-caps block mb-1">
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={12}
        autoComplete="new-password"
        autoFocus
        className="w-full hairline bg-paper-raised px-3 py-2.5 focus:outline-none focus:border-fairway"
      />
      <p className="mt-1 text-xs text-graphite-ink">At least 12 characters. A short sentence works well.</p>

      <label htmlFor="confirm" className="label-caps mt-4 block mb-1">
        New password again
      </label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        required
        minLength={12}
        autoComplete="new-password"
        className="w-full hairline bg-paper-raised px-3 py-2.5 focus:outline-none focus:border-fairway"
      />

      {state?.error && (
        <p className="mt-4 hairline border-flag bg-flag-wash px-3 py-2 text-sm" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton label={purpose === "invite" ? "Set password and continue" : "Save new password"} />
    </form>
  );
}
