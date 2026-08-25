/**
 * The Pin High brand lockup, drawn as SVG from the supplied artwork.
 *
 * The mark: a golf ball rim breaking into dimples at the top, two fairway
 * hills and the pin inside, the whole ball sitting on a map-pin point —
 * "pin high" as both the golf term and the location. Vector, so it is pixel
 * sharp from the 16px favicon to a hero.
 *
 * Brand colours (from the artwork):
 *   navy  #1B2A47   green #5CB947   red #D93A2B
 *
 * `tone="dark"` renders for dark grounds (navy footer, hero): HIGH flips to
 * white, everything else keeps its brand colour.
 *
 * `size="site"` is the public header/footer lockup — large enough to read as
 * the brand, not a quiet icon. Admin chrome uses `compact`.
 */

const NAVY = "#1B2A47";
const GREEN = "#5CB947";
const RED = "#D93A2B";

const SIZES = {
  site: { mark: 72, wordmark: 44, gap: "gap-4" },
  compact: { mark: 32, wordmark: 20, gap: "gap-2" },
} as const;

export type LogoSize = keyof typeof SIZES;

function Mark({ size, clipId }: { size: number; clipId: string }) {
  return (
    <svg
      width={size}
      height={size * 1.18}
      viewBox="0 0 100 118"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Ball rim — slightly heavier so the mark holds at header size. */}
      <circle cx="50" cy="46" r="38" stroke={NAVY} strokeWidth="9.5" />

      <g fill={NAVY}>
        {[-64, -52, -40, -28, -16, -4, 8, 20, 32, 44].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          return (
            <circle
              key={`o${deg}`}
              cx={50 + 29 * Math.cos(rad)}
              cy={46 + 29 * Math.sin(rad)}
              r="2.6"
            />
          );
        })}
        {[-54, -41, -28, -15, -2, 11, 24, 37].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          return (
            <circle
              key={`i${deg}`}
              cx={50 + 21.5 * Math.cos(rad)}
              cy={46 + 21.5 * Math.sin(rad)}
              r="2.1"
            />
          );
        })}
      </g>

      <clipPath id={clipId}>
        <circle cx="50" cy="46" r="33.5" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <path d="M 46 80 Q 66 48 88 72 L 88 80 Z" fill={GREEN} />
        <path d="M 8 82 Q 34 46 62 82 Z" fill={GREEN} />
      </g>

      <rect x="48.4" y="26" width="3.2" height="42" rx="1.2" fill={NAVY} />
      <path d="M 51.5 27 L 67 32.5 L 51.5 38 Z" fill={RED} />
      <path d="M 32 76 Q 50 92 68 76 L 52.5 112 Q 50 117 47.5 112 Z" fill={GREEN} />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  tone?: "light" | "dark";
  size?: LogoSize;
  /** Wordmark only where the mark would be noise (tight admin chrome). */
  withMark?: boolean;
}

export function Logo({
  className,
  tone = "light",
  size = "compact",
  withMark = true,
}: LogoProps) {
  const highFill = tone === "dark" ? "#FFFFFF" : NAVY;
  const scale = SIZES[size];
  const clipId = `ph-ball-${size}-${tone}`;
  return (
    <span
      className={`inline-flex items-center ${scale.gap} ${className ?? ""}`}
      role="img"
      aria-label="Pin High"
    >
      {withMark && <Mark size={scale.mark} clipId={clipId} />}
      <svg
        height={scale.wordmark}
        viewBox="0 0 248 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="shrink-0"
      >
        <text
          x="0"
          y="33"
          fontFamily="var(--font-display), sans-serif"
          fontSize="36"
          fontWeight="800"
          letterSpacing="-0.4"
        >
          <tspan fill={GREEN}>PIN</tspan>
          <tspan fill={highFill}>HIGH</tspan>
        </text>
      </svg>
    </span>
  );
}

/** The mark alone, for square slots. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <Mark size={size} clipId={`ph-ball-mark-${size}`} />;
}
