"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordReset } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full bg-fairway px-4 py-3 text-paper font-medium hover:bg-ink transition-colors duration-150 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Email me a reset link"}
    </button>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState(requestPasswordReset, null);

  if (state?.message) {
    return (
      <p className="mt-8 hairline bg-paper-raised px-4 py-3 text-sm" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-8">
      <label htmlFor="email" className="label-caps block mb-1">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="username"
        autoFocus
        className="w-full hairline bg-paper-raised px-3 py-2.5 focus:outline-none focus:border-fairway"
      />

      {state?.error && (
        <p className="mt-4 hairline border-flag bg-flag-wash px-3 py-2 text-sm" role="alert">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
