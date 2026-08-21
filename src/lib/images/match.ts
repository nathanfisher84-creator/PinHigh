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
  /** CAD line drawings, deliberately left out rather than reported as a problem. */
  skippedCad: string[];
  /** Article numbers that got at least one photo in this pack. */
  articlesCovered: string[];
}

/**
 * adidas ships a CAD line drawing alongside the photography, named as a
 * numbered variant of a view — `HZ6891_Standard View-1.jpeg`,
 * `IS7344_Back View-1.jpeg`. They are flat technical illustrations, not
 * product shots, and putting one on a catalogue page next to real photographs
 * looks like a mistake. They are skipped, and counted separately so a pack of
 * 164 files does not report 21 "problems" that are not problems.
 */
export function isCadDrawing(filename: string): boolean {
  const stem = filename.replace(IMAGE_EXT, "").trim();

  const numbered = stem.match(/^(.*?)[\s._-]*-(\d+)$/);
  if (!numbered) return false;

  /*
   * A trailing number alone is not enough to call something a CAD: §5's own
   * convention is `{article}_{n}.jpg`, and `41002-1.jpg` is photo one of
   * article 41002.
   *
   * What marks a CAD is that the number qualifies a *named view* —
   * `Standard View-1`, `Back View-1`. So the token immediately before the
   * number has to be a word. An article number is not.
   */
  const lastToken = numbered[1].split(/[\s_]+/).pop() ?? "";
  return /[A-Za-z]{2,}/.test(lastToken);
}

/**
 * Which photograph leads.
 *
 * The ghost-mannequin "Standard View" is the shot adidas uses as its own hero
 * and is the one a buyer recognises, so it takes the card. Everything else
 * falls in behind it in the order someone would flip through them.
 */
const VIEW_ORDER: [RegExp, number][] = [
  [/standard\s*view/i, 0],
  [/front\s*view/i, 1],
  [/F_Torso/i, 2],
  [/back\s*view/i, 3],
  [/B_Torso/i, 4],
  [/side\s*view/i, 5],
  [/back\s*cent(er|re)\s*view/i, 6],
];

export function viewRank(suffix: string): number {
  // Back Center View also matches "back view", so the most specific wins.
  if (/back\s*cent(er|re)/i.test(suffix)) return 6;
  for (const [re, rank] of VIEW_ORDER) {
    if (re.test(suffix)) return rank;
  }
  return 7;
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
  const skippedCad: string[] = [];
  const covered = new Set<string>();

  for (const file of files) {
    const filename = file.path.split("/").pop() ?? file.path;

    if (IMAGE_EXT.test(filename) && isCadDrawing(filename)) {
      skippedCad.push(filename);
      continue;
    }

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
      /*
       * adidas names the view rather than numbering it, so ordering comes from
       * which view it is. A number at the front of the suffix still wins where
       * there is one, which keeps `41001_1.jpg` and `HZ6891_03_Back.jpg`
       * working for anyone using that convention.
       */
      const leading = suffix.match(/^(\d{1,3})(?:\D|$)/);
      hit = {
        article,
        sequence: leading ? Number(leading[1]) : viewRank(suffix),
      };
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

  return { matched, unmatched, skippedCad, articlesCovered: [...covered].sort() };
}
