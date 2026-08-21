/**
 * Where this instance is running, and what that means for the data it holds.
 *
 * With DATABASE_URL set (Supabase Postgres, spec §2), everything persists and
 * none of this matters. Without it the application falls back to an embedded
 * in-memory database that reseeds per process (see `lib/db/core.ts`) — fine
 * for development, but on Vercel it means anything *written* (a quote
 * request, a stock import, an uploaded logo) lives only as long as one
 * instance. The site must say so rather than silently losing a buyer's
 * enquiry, which is what `isEphemeralStore()` drives.
 */

export function isVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_URL);
}

/** True when writes will not survive. Drives the notice in the layout. */
export function isEphemeralStore(): boolean {
  const hasDurableStore = Boolean(
    process.env.DATABASE_URL || process.env.PINHIGH_DURABLE_STORE,
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
