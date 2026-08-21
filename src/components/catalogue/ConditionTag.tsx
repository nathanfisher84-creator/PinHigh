import { CONDITION_LABELS, type Condition } from "@/lib/domain/types";

/**
 * Condition labelling (spec §10).
 *
 * "Mixing used equipment into a trade catalogue without saying so is the single
 * fastest way to lose a professional buyer's trust." So this is deliberately
 * not subtle, appears on the card, the product page and the confirmation, and
 * never relies on colour alone to carry the meaning.
 */
export function ConditionTag({
  condition,
  size = "sm",
}: {
  condition: Condition;
  size?: "sm" | "md";
}) {
  if (condition === "new") return null;

  return (
    <span
      className={[
        "inline-block bg-flag text-paper font-semibold uppercase tracking-wider",
        size === "md" ? "text-xs px-2.5 py-1" : "text-2xs px-2 py-1",
      ].join(" ")}
    >
      {CONDITION_LABELS[condition]}
    </span>
  );
}
