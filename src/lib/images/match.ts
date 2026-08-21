/**
 * Matching supplier photo filenames to article numbers (spec §5).
 *
 * adidas ships photographs whose **first six characters are the article
 * number** — `HZ6891_...jpg` for article HZ6891 — and the rest of the filename
 * is whatever their asset system produced. That is the rule that matters here.
 *
 * §5 also describes `{article_number}_{n}.jpg` and a bare `41001.jpg`; both
 * still work, because all three are the same rule seen from different angles:
 * a filename belongs to the article number it starts with.
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

    /*
     * Otherwise the filename should *start* with an article number. Longest
     * first, so a longer article number wins over a shorter one that happens
     * to be its prefix.
     *
     * The remainder decides what happens next, and this is the part worth
     * being careful about:
     *
     *   - Nothing, or a separator and digits, or a separator and any adidas
     *     asset suffix (`HZ6891_Front`, `HZ6891 (1)`) — this is a photo of
     *     that article. Digits found anywhere in the remainder order it.
     *
     *   - Characters that run straight on with no separator — `41001NAVY` —
     *     are refused, because that reads as a different article number
     *     rather than a suffix on this one.
     *
     * The separator requirement is what stops `41001-NAVY.jpg` being filed
     * under article 41001. That is a different colourway, and hanging a navy
     * photograph on the white product is worse than not matching at all.
     */
    let hit: { article: string; sequence: number } | null = null;

    for (const article of byLength) {
      if (!norm(stem).startsWith(norm(article))) continue;

      const rest = stem.slice(article.length);

      // Ran straight on into more characters: a different article number.
      if (rest.length > 0 && !/^[\s._-]/.test(rest)) continue;

      const suffix = rest.replace(/^[\s._-]+/, "");
      const digits = suffix.match(/\d{1,3}/);
      hit = { article, sequence: digits ? Number(digits[0]) : 0 };
      break;
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
