import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // node:sqlite is a Node builtin; keep it out of the bundler's dependency graph.
  serverExternalPackages: ["node:sqlite"],

  /*
   * The catalogue seeds itself from the stock template on first run. That file
   * is opened through a path built at runtime, which output file tracing does
   * not reliably detect, so it is included explicitly — without this the
   * deployed lambda boots to an empty catalogue.
   */
  outputFileTracingIncludes: {
    "/**": ["./seed/**"],
  },
  images: {
    formats: ["image/webp"],
    deviceSizes: [400, 800, 1600],
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
