"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full bg-fairway px-4 py-3 text-paper font-medium hover:bg-ink transition-colors duration-150 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(login, null);

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="next" value={next} />

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

      <label htmlFor="password" className="label-caps mt-4 block mb-1">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="w-full hairline bg-paper-raised px-3 py-2.5 focus:outline-none focus:border-fairway"
      />

      {state?.error && (
        <p
          className="mt-4 hairline border-flag bg-flag-wash px-3 py-2 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
