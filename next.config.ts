import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Reads go to a database that can sit an ocean away from the build
  // machine; give prerendering headroom over the 60s default.
  staticPageGenerationTimeout: 120,
  // Native/wasm-backed packages stay out of the bundler's dependency graph:
  // pg (net sockets), PGlite (wasm assets on disk), sharp (native binaries).
  serverExternalPackages: ["pg", "@electric-sql/pglite", "sharp"],

  /*
   * The catalogue seeds itself from the stock template on first run. That file
   * is opened through a path built at runtime, which output file tracing does
   * not reliably detect, so it is included explicitly — without this the
   * deployed lambda boots to an empty catalogue.
   */
  outputFileTracingIncludes: {
    // Includes seed/images, which is how a fresh instance comes up with
    // photography rather than placeholders.
    "/**": ["./seed/**"],
  },
  experimental: {
    /*
     * Image and stock uploads travel through Server Actions, whose body limit
     * defaults to 1 MB — far too small for a zip of supplier photographs.
     *
     * Note for Vercel: the platform caps a serverless request body at 4.5 MB
     * regardless of this setting, so large packs must be uploaded in batches
     * there, or routed straight to blob storage with a signed URL. Self-hosted
     * and local development get the full allowance.
     */
    serverActions: { bodySizeLimit: "25mb" },
  },
  images: {
    formats: ["image/webp"],
    deviceSizes: [400, 800, 1600],
    // Product photography served from Supabase Storage's public bucket.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
