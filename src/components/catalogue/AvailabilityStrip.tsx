import { stockLevel } from "@/lib/domain/sizes";

/**
 * The compact availability strip on a listing card (spec §6.2) — "which sizes
 * are live", read at a glance without opening the product.
 *
 * Colour here is doing the one job §10 permits it: encoding inventory state.
 * It never carries the meaning alone, though — the size letter is always
 * present and sold-out sizes are struck through, so the strip survives being
 * read in greyscale or by someone who cannot distinguish the two greens.
 */
export function AvailabilityStrip({
  sizes,
}: {
  sizes: { size: string; quantity: number }[];
}) {
  if (sizes.length === 0) return null;

  const live = sizes.filter((s) => s.quantity > 0).length;

  return (
    <div>
      <ul
        className="flex flex-wrap gap-px"
        aria-label={`${live} of ${sizes.length} sizes in stock`}
      >
        {sizes.map((s) => {
          const level = stockLevel(s.quantity);
          return (
            <li
              key={s.size}
              title={
                s.quantity > 0 ? `${s.size} — ${s.quantity} available` : `${s.size} — sold out`
              }
              className={[
                "tabular text-2xs px-1.5 py-0.5 border",
                level === "out"
                  ? "border-sand text-graphite line-through decoration-1"
                  : level === "low"
                    ? "border-flag text-flag-ink"
                    : "border-sand-soft bg-fairway-wash text-ink",
              ].join(" ")}
            >
              {s.size}
              <span className="sr-only">
                {s.quantity > 0 ? `, ${s.quantity} available` : ", sold out"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
