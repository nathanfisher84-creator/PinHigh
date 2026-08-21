"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that reflects the form's own pending state.
 *
 * §9: "Build the admin to be genuinely pleasant." A button that gives no
 * feedback gets clicked twice, and on a settings form that is merely annoying —
 * on a stock import it would be a real problem.
 */
export function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "px-5 py-2.5 text-paper font-medium transition-colors duration-150 disabled:opacity-60",
        variant === "danger" ? "bg-flag hover:bg-flag-ink" : "bg-fairway hover:bg-ink",
      ].join(" ")}
    >
      {pending ? (pendingLabel ?? "Saving…") : label}
    </button>
  );
}
