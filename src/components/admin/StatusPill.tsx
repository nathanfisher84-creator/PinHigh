import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/domain/types";

/**
 * Status is carried by the word first and the treatment second, so the list
 * stays readable in greyscale and for anyone who cannot separate the two
 * greens. §10 restricts colour to encoding state, which this is.
 */
const STYLES: Record<QuoteStatus, string> = {
  new: "bg-fairway text-paper",
  in_progress: "bg-sand text-ink",
  quoted: "border border-fairway text-fairway",
  won: "bg-fairway-wash text-fairway border border-fairway",
  lost: "border border-sand text-graphite-ink",
  expired: "border border-sand text-graphite-ink line-through decoration-1",
};

export function StatusPill({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider whitespace-nowrap ${STYLES[status]}`}
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
