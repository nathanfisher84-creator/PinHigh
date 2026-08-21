import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/runtime";
import { all } from "@/lib/db";
import { CATEGORIES } from "@/lib/domain/types";
import { listBrands } from "@/lib/repo/catalogue";

/**
 * Sitemap (spec §11, §14.4).
 *
 * Product pages are indexable because this is a discovery channel for new trade
 * accounts. §14.4 is worth remembering when reading the analytics afterwards:
 * the old consumer rankings will fall, and that is the intended outcome —
 * success is measured in corporate enquiries, not traffic.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  const products = all<{ article_number: string; updated_at: string }>(
    "SELECT article_number, updated_at FROM products WHERE is_visible = 1 AND condition = 'new'",
  );

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/catalogue`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/brands`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...CATEGORIES.map((c) => ({
      url: `${base}/catalogue/${c}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...listBrands().map((b) => ({
      url: `${base}/brand/${encodeURIComponent(b.value.toLowerCase())}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${base}/product/${encodeURIComponent(p.article_number)}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
