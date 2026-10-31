/** Where a match lands, best last. Ranking compares this before anything else. */
export const Quality = {
  /** Letters spread out: "gthb" → GitHub. */
  Scattered: 0,
  /** Inside a word: "ama" → Ramaswamy. */
  InsideWord: 1,
  /** At the start of a word or URL segment: "rama" → Vivek Ramaswamy, "ama" → amazon.co.uk. */
  WordStart: 2,
} as const;
export type Quality = (typeof Quality)[keyof typeof Quality];

export interface Match {
  score: number;
  quality: Quality;
  indices: number[];
}

const BOUNDARY = /[\s\-_/.:?&=#|()[\]]/;

function isBoundary(text: string, i: number): boolean {
  return i === 0 || BOUNDARY.test(text[i - 1]!);
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, k) => start + k);
}

/**
 * Contiguous, case-insensitive match. Prefers an occurrence at a word boundary.
 * `token` must already be lower case.
 */
export function matchSubstring(token: string, text: string): Match | null {
  const lower = text.toLowerCase();
  let best = -1;
  for (let i = lower.indexOf(token); i !== -1; i = lower.indexOf(token, i + 1)) {
    if (isBoundary(lower, i)) {
      best = i;
      break;
    }
    if (best === -1) best = i;
  }
  if (best === -1) return null;
  const atWordStart = isBoundary(lower, best);
  const score = best === 0 ? 100 : atWordStart ? 80 : 50;
  return { score, quality: atWordStart ? Quality.WordStart : Quality.InsideWord, indices: range(best, token.length) };
}

/**
 * Characters of `token` appear in order, not necessarily together ("gtb" → "GitHub").
 * Scores well below any substring match. `token` must already be lower case.
 */
export function matchSubsequence(token: string, text: string): Match | null {
  const lower = text.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of token) {
    const i = lower.indexOf(ch, from);
    if (i === -1) return null;
    score += i === prev + 1 ? 5 : isBoundary(lower, i) ? 4 : 1;
    indices.push(i);
    prev = i;
    from = i + 1;
  }
  const gaps = indices[indices.length - 1]! - indices[0]! + 1 - token.length;
  return { score: Math.max(1, score - gaps * 0.5), quality: Quality.Scattered, indices };
}

export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export interface FieldMatch {
  score: number;
  /** The weakest token's quality: "ama zon" is only as good as its worst word. */
  quality: Quality;
  titleMatches: number[];
  urlMatches: number[];
}

/**
 * Every token must match the title or the URL, in any order ("pr github").
 * For each token the best-quality match wins; URL matches count for less than
 * title matches of the same quality. Fuzzy matching only applies to titles,
 * since subsequences of URLs are mostly noise.
 */
export function matchFields(tokens: string[], title: string, url: string): FieldMatch | null {
  let score = 0;
  let quality: Quality = Quality.WordStart;
  const titleMatches = new Set<number>();
  const urlMatches = new Set<number>();

  for (const token of tokens) {
    const inTitle = matchSubstring(token, title);
    const inUrl = matchSubstring(token, url);
    const fuzzyTitle = inTitle ? null : matchSubsequence(token, title);

    const candidates: [Match | null, Set<number>, number][] = [
      [inTitle, titleMatches, 1],
      [inUrl, urlMatches, 0.8],
      [fuzzyTitle, titleMatches, 1],
    ];
    let best: [Match, Set<number>, number] | null = null;
    for (const [m, set, weight] of candidates) {
      if (!m) continue;
      const better =
        !best ||
        m.quality > best[0].quality ||
        (m.quality === best[0].quality && m.score * weight > best[0].score * best[2]);
      if (better) best = [m, set, weight];
    }
    if (!best) return null;

    score += best[0].score * best[2];
    quality = Math.min(quality, best[0].quality) as Quality;
    for (const i of best[0].indices) best[1].add(i);
  }

  const sort = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { score, quality, titleMatches: sort(titleMatches), urlMatches: sort(urlMatches) };
}
