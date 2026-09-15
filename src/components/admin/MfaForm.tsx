"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { verifyMfa } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full bg-fairway px-4 py-3 text-paper font-medium hover:bg-ink transition-colors duration-150 disabled:opacity-60"
    >
      {pending ? "Checking…" : "Continue"}
    </button>
  );
}

export function MfaForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(verifyMfa, null);

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="next" value={next} />

      <label htmlFor="code" className="label-caps block mb-1">
        Code from your authenticator app
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        autoFocus
        placeholder="123 456"
        className="w-full hairline bg-paper-raised px-3 py-2.5 tabular text-lg tracking-widest focus:outline-none focus:border-fairway"
      />
      <p className="mt-2 text-xs text-graphite-ink">
        Lost your phone? Enter one of the recovery codes you saved when you set
        the authenticator up.
      </p>

      {state?.error && (
        <p className="mt-4 hairline border-flag bg-flag-wash px-3 py-2 text-sm" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
