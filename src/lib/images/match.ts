/**
 * Matching supplier photo filenames to article numbers (spec §5).
 *
 * "Auto-match filenames to products by article number, using the pattern
 * `{article_number}_{n}.jpg` — `41001_1.jpg`, `41001_2.jpg`. Also accept a bare
 * `41001.jpg`."
 *
 * The trap here is that an article number is an opaque string (§3) and may
 * itself contain hyphens or underscores — `ULT365-STRIPE-M_2.jpg` is a
 * perfectly reasonable supplier filename. So this never *parses* a filename
 * into parts and hopes; it matches the stem against the set of article numbers
 * that actually exist, longest first, and only then reads what remains as a
 * sequence number.
 *
 * Pure functions over strings, so the awkward cases are unit tested rather
 * than discovered by the owner on a Monday morning with 300 photos.
 */

export interface MatchInput {
  /** Path inside the zip, e.g. "polos/41001_2.jpg". */
  path: string;
}

export interface MatchedFile {
  path: string;
  filename: string;
  article_number: string;
  /** Ordering within the product. Bare `41001.jpg` sorts first. */
  sequence: number;
}

export interface UnmatchedFile {
  path: string;
  filename: string;
  reason: string;
}

export interface MatchResult {
  matched: MatchedFile[];
  unmatched: UnmatchedFile[];
  /** Article numbers that got at least one photo in this pack. */
  articlesCovered: string[];
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|tiff?)$/i;

/** Normalise for comparison: case and separator-insensitive. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Match a set of filenames against known article numbers.
 *
 * `knownArticles` must be every article number in the catalogue — matching is
 * done against reality, never against a guessed pattern.
 */
export function matchImageFilenames(
  files: MatchInput[],
  knownArticles: string[],
): MatchResult {
  // Longest first, so "41001-A" wins over "41001" when both exist and the
  // filename is "41001-A_2.jpg".
  const byLength = [...knownArticles].sort((a, b) => b.length - a.length);
  const normalisedIndex = new Map<string, string>();
  for (const a of byLength) {
    const key = norm(a);
    if (!normalisedIndex.has(key)) normalisedIndex.set(key, a);
  }

  const matched: MatchedFile[] = [];
  const unmatched: UnmatchedFile[] = [];
  const covered = new Set<string>();

  for (const file of files) {
    const filename = file.path.split("/").pop() ?? file.path;

    if (!IMAGE_EXT.test(filename)) {
      unmatched.push({
        path: file.path,
        filename,
        reason: "Not an image file.",
      });
      continue;
    }

    const stem = filename.replace(IMAGE_EXT, "");

    // Exact stem is an article number: "41001.jpg".
    const exact = normalisedIndex.get(norm(stem));
    if (exact) {
      matched.push({ path: file.path, filename, article_number: exact, sequence: 0 });
      covered.add(exact);
      continue;
    }

    // Otherwise the stem should be an article number followed by a separator
    // and a sequence: "41001_2.jpg", "41001-2.jpg", "ULT365-STRIPE-M_2.jpg".
    let hit: { article: string; sequence: number } | null = null;

    for (const article of byLength) {
      const a = norm(article);
      const s = norm(stem);
      if (!s.startsWith(a)) continue;

      const rest = stem.slice(article.length);
      // The remainder, once separators are stripped, must be only digits —
      // otherwise "41001-NAVY.jpg" would be filed under article 41001, which
      // is a different colourway and therefore a different product.
      const seq = rest.replace(/^[\s_-]+/, "");
      if (/^\d{1,3}$/.test(seq)) {
        hit = { article, sequence: Number(seq) };
        break;
      }
      // Handle the normalised case where separators differ in length.
      const restNorm = s.slice(a.length);
      if (/^\d{1,3}$/.test(restNorm)) {
        hit = { article, sequence: Number(restNorm) };
        break;
      }
    }

    if (hit) {
      matched.push({
        path: file.path,
        filename,
        article_number: hit.article,
        sequence: hit.sequence,
      });
      covered.add(hit.article);
    } else {
      unmatched.push({
        path: file.path,
        filename,
        reason: "No article number in the catalogue matches this filename.",
      });
    }
  }

  // Stable order: by article, then by the sequence the supplier intended.
  matched.sort(
    (a, b) =>
      a.article_number.localeCompare(b.article_number) ||
      a.sequence - b.sequence ||
      a.filename.localeCompare(b.filename),
  );

  return { matched, unmatched, articlesCovered: [...covered].sort() };
}
