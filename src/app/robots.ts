import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/runtime";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Quote confirmations carry a buyer's company and contact details, and
        // the admin panel is nobody's business. Neither should ever be indexed.
        disallow: ["/admin", "/admin/", "/quote/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
