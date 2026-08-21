import Image from "next/image";

/**
 * Product imagery, with the branded placeholder §5 requires.
 *
 * "Products without images render a branded placeholder, never a broken icon."
 * That matters more here than on most catalogues: the owner's supplier image
 * packs arrive piecemeal, so a partly-illustrated catalogue is the normal
 * state, not an error condition, and it has to look deliberate.
 */

interface Props {
  src: string | null;
  alt: string;
  articleNumber: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

export function ProductImage({
  src,
  alt,
  articleNumber,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  priority = false,
  className = "",
}: Props) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );
  }

  return <ProductPlaceholder articleNumber={articleNumber} />;
}

/**
 * The placeholder. A gridded field carrying the article number in mono — it
 * belongs to the yardage-book concept rather than apologising for a missing
 * photograph, and it still tells the buyer the one thing they need to quote it.
 */
export function ProductPlaceholder({ articleNumber }: { articleNumber: string }) {
  return (
    <div
      className="absolute inset-0 bg-paper-sunken flex items-center justify-center"
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 h-full w-full text-sand"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="ph-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ph-grid)" opacity="0.55" />
      </svg>
      <span className="relative tabular text-xs text-graphite-ink px-2 py-1 bg-paper-sunken">
        {articleNumber}
      </span>
    </div>
  );
}
