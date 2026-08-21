import { NextResponse, type NextRequest } from "next/server";
import { REDIRECTS, matchRedirect } from "@/lib/redirects";

/**
 * Middleware does two jobs.
 *
 * 1. Gates /admin (spec §9). The signature check itself lives in `lib/auth`,
 *    but middleware runs on the Edge runtime where node:crypto is not
 *    available, so this only checks that a session cookie is *present* and
 *    each admin page re-verifies it properly server-side. A stolen or forged
 *    cookie gets past middleware and is rejected by the page — the gate that
 *    matters is the one with the secret.
 *
 * 2. Serves the Shopify redirect map (§14.3). "No previously indexed URL may
 *    return a 404", and 301 rather than 302 so the equity actually moves.
 */

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /* -- Legacy Shopify URLs (§14.3) -------------------------------------- */
  const redirect = matchRedirect(pathname);
  if (redirect) {
    const url = new URL(redirect, request.url);
    if (search) url.search = search;
    return NextResponse.redirect(url, 301);
  }

  /* -- Admin gate (§9) --------------------------------------------------- */
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const cookie = request.cookies.get("ph_admin")?.value;
    if (!cookie) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static files. The redirect map has
     * to see real page requests, so this cannot be narrowed to /admin.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js)$).*)",
  ],
};

export { REDIRECTS };
