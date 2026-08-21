/**
 * Where this instance is running, and what that means for the data it holds.
 *
 * The application stores everything in a SQLite file (see `lib/db/core.ts`).
 * That is fine on a normal server and fine locally, but Vercel's serverless
 * filesystem is read-only apart from `/tmp`, and `/tmp` is per-instance and
 * discarded when the instance recycles.
 *
 * So on Vercel the catalogue works perfectly — it is re-seeded from the bundled
 * stock file on cold start — but anything *written* (a quote request, a stock
 * import, an uploaded logo) lives only as long as that one instance. The site
 * must say so rather than silently losing a buyer's enquiry.
 *
 * Setting up Supabase (spec §2) is what makes this go away, and
 * `isEphemeralStore()` returns false as soon as it is configured.
 */

export function isVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_URL);
}

/** True when writes will not survive. Drives the notice in the layout. */
export function isEphemeralStore(): boolean {
  const hasDurableStore = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PINHIGH_DURABLE_STORE,
  );
  return isVercel() && !hasDurableStore;
}

/**
 * The site's own origin.
 *
 * Prefers an explicit NEXT_PUBLIC_SITE_URL, then the URL Vercel assigns the
 * deployment, then the production domain. Without the Vercel fallback a
 * preview deployment would publish canonical URLs and a sitemap pointing at
 * pinhighuae.com, which is actively wrong while the real site still lives
 * there (§14).
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://pinhighuae.com";
}

/**
 * Whether search engines should index this deployment.
 * Only the real production domain should be indexed — a preview deployment
 * competing with the live site in search results is its own problem (§11).
 */
export function isIndexable(): boolean {
  return siteUrl().includes("pinhighuae.com");
}
