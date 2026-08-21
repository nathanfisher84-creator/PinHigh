import Link from "next/link";

/**
 * Empty states direct rather than apologise (spec §10).
 *
 * The reference the spec gives is "No sizes selected yet. Enter quantities on
 * any product to begin." — a statement of fact plus the next action, with no
 * "Sorry!" and no illustration.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="hairline bg-paper-raised px-6 py-12 text-center">
      <p className="text-lg font-medium">{title}</p>
      {body && <p className="mt-2 text-sm text-graphite-ink max-w-md mx-auto">{body}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-block bg-fairway px-5 py-2.5 text-sm text-paper hover:bg-ink transition-colors duration-150"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
