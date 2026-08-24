/**
 * Official adidas.ae product copy, keyed by article number.
 *
 * Rule: never invent adidas marketing copy. Every field here is either
 * retrieved from https://www.adidas.ae or left empty. The PDP reads this
 * mapping first; missing copy surfaces as "Details on request".
 *
 * Retrieved on 24 Aug 2026 from this environment: adidas.ae (and adidas.com
 * product APIs) returned HTTP 403 from Akamai bot protection. No article
 * copy was stored.
 */

export interface OfficialProductCopy {
  article_number: string;
  /** URLs we actually requested. */
  attempted_urls: string[];
  retrieved: boolean;
  block_reason: string | null;
  source_url: string | null;
  material: string | null;
  features: string[];
  benefits: string[];
  description: string | null;
}

const BLOCKED_AE =
  "adidas.ae returned HTTP 403 (Akamai bot protection) on 24 Aug 2026. No page HTML was retrieved.";

const ATTEMPTED = (article: string): string[] => [
  `https://www.adidas.ae/en/${article.toLowerCase()}.html`,
  `https://www.adidas.ae/en/${article}.html`,
  `https://www.adidas.ae/en/search?q=${article}`,
  `https://www.adidas.ae/api/products/${article}`,
  `https://www.adidas.ae/api/search/product/${article}`,
];

function emptyEntry(article: string): OfficialProductCopy {
  return {
    article_number: article,
    attempted_urls: ATTEMPTED(article),
    retrieved: false,
    block_reason: BLOCKED_AE,
    source_url: null,
    material: null,
    features: [],
    benefits: [],
    description: null,
  };
}

/** Seeded live articles from the adidas implementation / image pack. */
export const SEEDED_ARTICLES = [
  "HZ6891",
  "HZ6892",
  "HZ6893",
  "HZ6894",
  "IQ2935",
  "IS7344",
  "IS7345",
  "IS7346",
  "IU4435",
  "IU4436",
  "IU4437",
  "IU4441",
  "IU4442",
  "IU4443",
  "IU4444",
  "IU4485",
  "IU4486",
  "JP0473",
  "JY5470",
  "JY5471",
  "KC1118",
  "KS2292",
  "KT2806",
] as const;

export const ADIDAS_OFFICIAL_COPY: Record<string, OfficialProductCopy> = Object.fromEntries(
  SEEDED_ARTICLES.map((article) => [article, emptyEntry(article)]),
);

export function officialCopy(articleNumber: string): OfficialProductCopy {
  const key = articleNumber.trim().toUpperCase();
  return (
    ADIDAS_OFFICIAL_COPY[key] ?? {
      article_number: key,
      attempted_urls: ATTEMPTED(key),
      retrieved: false,
      block_reason: null,
      source_url: null,
      material: null,
      features: [],
      benefits: [],
      description: null,
    }
  );
}

/** True only when we actually pulled official adidas.ae text. */
export function hasOfficialCopy(copy: OfficialProductCopy): boolean {
  if (!copy.retrieved) return false;
  return Boolean(
    copy.material ||
      copy.description ||
      copy.features.length > 0 ||
      copy.benefits.length > 0,
  );
}

/** Every adidas.ae URL we actually requested for the seeded catalogue. */
export function allAttemptedAdidasUrls(): string[] {
  return [...new Set(SEEDED_ARTICLES.flatMap((article) => officialCopy(article).attempted_urls))];
}

/**
 * Split stored product fields (newline-separated) without inventing copy.
 * Empty / whitespace-only values drop out.
 */
export function splitCopyLines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
