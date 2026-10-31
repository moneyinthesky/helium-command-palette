import { matchFields, type Quality, tokenize } from "./fuzzy";
import type { PaletteItem, ScoredItem } from "./types";

export const MAX_RESULTS = 10;

const HOUR = 60 * 60 * 1000;

/** With nothing typed: open tabs, then history, then the tab you're already on. */
function tier(item: PaletteItem): number {
  if (item.kind === "history") return 1;
  return item.isSource ? 0 : 2;
}

/**
 * With a query, results are grouped by where the match lands (word start,
 * inside a word, scattered letters), and within each of those, open tabs come
 * before history. "ama" finds Amazon in history before a tab that only has it
 * inside "Ramaswamy". The tab you're already on is always last.
 */
function group(item: PaletteItem, quality: Quality): number {
  if (item.kind === "tab" && item.isSource) return 0;
  return 1 + quality * 2 + (item.kind === "tab" ? 1 : 0);
}

/** Larger than any match score plus boost, so groups never mix. */
const GROUP_SIZE = 1e6;

function lastUsed(item: PaletteItem): number {
  return item.kind === "tab" ? item.lastAccessed : item.lastVisitTime;
}

/** Up to `max` for something used just now, halving after `halfLifeHours`. */
function recency(time: number, now: number, max: number, halfLifeHours: number): number {
  const ageHours = Math.max(0, now - time) / HOUR;
  return max / (1 + ageHours / halfLifeHours);
}

/** Extra score on top of the text match: how likely you want this item. */
function boost(item: PaletteItem, now: number): number {
  switch (item.kind) {
    case "tab":
      return recency(item.lastAccessed, now, 15, 6);
    case "history":
      // Frecency: visited often, typed by hand, visited lately. Up to about 35.
      return (
        Math.min(15, 3 * Math.log2(1 + item.visitCount)) +
        Math.min(8, 4 * Math.log2(1 + item.typedCount)) +
        recency(item.lastVisitTime, now, 12, 24)
      );
  }
}

/** With nothing typed: most recently used first within each group. */
function emptyQueryScore(item: PaletteItem): number {
  return tier(item) * 1e15 + lastUsed(item);
}

export function rank(
  items: PaletteItem[],
  query: string,
  { limit = MAX_RESULTS, now = Date.now() } = {},
): ScoredItem[] {
  const tokens = tokenize(query);
  const scored: ScoredItem[] = [];

  for (const item of items) {
    if (tokens.length === 0) {
      scored.push({ item, score: emptyQueryScore(item), titleMatches: [], urlMatches: [] });
      continue;
    }
    const m = matchFields(tokens, item.title, item.displayUrl);
    if (!m) continue;
    const { quality, ...matches } = m;
    scored.push({ item, ...matches, score: group(item, quality) * GROUP_SIZE + m.score + boost(item, now) });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
