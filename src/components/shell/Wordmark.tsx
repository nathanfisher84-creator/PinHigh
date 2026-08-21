/**
 * The brand mark.
 *
 * Typographic, not illustrated (§10 rules out illustrated icons). The mark is
 * the wordmark plus a three-cell rule — a compressed reference to the yardage
 * book's gridded pages, and to the size run the whole site is built around.
 * It reads at 24px in a header and still holds at 12px in a footer.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 156 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pin High UAE"
    >
      <text
        x="0"
        y="19"
        fill="currentColor"
        fontFamily="var(--font-display), sans-serif"
        fontSize="19"
        fontWeight="600"
        letterSpacing="-0.6"
      >
        Pin High
      </text>

      {/* Three cells and a baseline — the size grid in miniature. */}
      <g stroke="currentColor" strokeWidth="1" opacity="0.55">
        <rect x="100" y="6" width="8" height="13" />
        <rect x="108" y="6" width="8" height="13" />
        <rect x="116" y="6" width="8" height="13" />
      </g>
      <rect x="100" y="16" width="8" height="3" fill="currentColor" opacity="0.5" />
      <rect x="108" y="11" width="8" height="8" fill="currentColor" opacity="0.85" />
      <rect x="116" y="13" width="8" height="6" fill="currentColor" opacity="0.7" />

      <text
        x="130"
        y="19"
        fill="currentColor"
        fontFamily="var(--font-mono), monospace"
        fontSize="11"
        fontWeight="500"
        letterSpacing="0.5"
        opacity="0.75"
      >
        UAE
      </text>
    </svg>
  );
}
