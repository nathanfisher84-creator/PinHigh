import Link from "next/link";

/**
 * §14.3 requires that no previously indexed URL 404s, and the redirect map
 * handles that. This page is for everything else — a mistyped article number,
 * a stale internal link — and it directs rather than apologises (§10).
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-24 text-center">
      <p className="label-caps">Not found</p>
      <h1 className="mt-3 text-3xl display-xl">That page isn&apos;t here.</h1>
      <p className="mt-4 text-graphite-ink">
        It may have moved when we rebuilt the site. The catalogue below has
        everything we hold, and search takes an article number straight in.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/catalogue"
          className="bg-fairway px-6 py-3 text-paper hover:bg-ink transition-colors duration-150"
        >
          Browse the catalogue
        </Link>
        <Link
          href="/contact"
          className="hairline px-6 py-3 hover:border-fairway transition-colors duration-150"
        >
          Ask us directly
        </Link>
      </div>
    </div>
  );
}
