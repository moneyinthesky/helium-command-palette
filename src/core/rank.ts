import { matchFields, tokenize } from "./fuzzy";
import type { PaletteItem, ScoredItem } from "./types";

export const MAX_RESULTS = 10;

const HOUR = 60 * 60 * 1000;

/** Up to +15 for something used just now, fading over a few hours. */
function recencyBoost(item: PaletteItem, now: number): number {
  const ageHours = Math.max(0, now - item.lastAccessed) / HOUR;
  return 15 / (1 + ageHours / 6);
}

/** The tab you're already on is the least useful result. */
const SOURCE_PENALTY = 1000;

export function rank(
  items: PaletteItem[],
  query: string,
  { limit = MAX_RESULTS, now = Date.now() } = {},
): ScoredItem[] {
  const tokens = tokenize(query);
  const scored: ScoredItem[] = [];

  for (const item of items) {
    const penalty = item.isSource ? SOURCE_PENALTY : 0;
    if (tokens.length === 0) {
      scored.push({ item, score: item.lastAccessed - penalty * HOUR, titleMatches: [], urlMatches: [] });
      continue;
    }
    const m = matchFields(tokens, item.title, item.displayUrl);
    if (!m) continue;
    scored.push({ item, ...m, score: m.score + recencyBoost(item, now) - penalty });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
