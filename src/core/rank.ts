import { matchFields, type Quality, tokenize } from "./fuzzy";
import type { ScoredItem, SourceItem, TabItem } from "./types";

export const MAX_RESULTS = 10;

const HOUR = 60 * 60 * 1000;

const KIND_ORDER: Record<SourceItem["kind"], number> = { history: 0, bookmark: 1, tab: 2 };

/**
 * With a query, results are grouped by where the match lands (word start,
 * inside a word, scattered letters), and within each of those, open tabs come
 * first, then bookmarks, then history. "ama" finds Amazon in history before a
 * tab that only has it inside "Ramaswamy". The tab you're already on is always last.
 */
function group(item: SourceItem, quality: Quality): number {
  if (item.kind === "tab" && item.isSource) return 0;
  return 1 + quality * 3 + KIND_ORDER[item.kind];
}

/** Larger than any match score plus boost, so groups never mix. */
const GROUP_SIZE = 1e6;

/** Frecency: visited often, typed by hand, visited lately. Up to about 35. */
function frecency(visitCount: number, typedCount: number, lastVisitTime: number, now: number): number {
  return (
    Math.min(15, 3 * Math.log2(1 + visitCount)) +
    Math.min(8, 4 * Math.log2(1 + typedCount)) +
    recency(lastVisitTime, now, 12, 24)
  );
}

/** Up to `max` for something used just now, halving after `halfLifeHours`. */
function recency(time: number, now: number, max: number, halfLifeHours: number): number {
  const ageHours = Math.max(0, now - time) / HOUR;
  return max / (1 + ageHours / halfLifeHours);
}

/** Extra score on top of the text match: how likely you want this item. */
function boost(item: SourceItem, now: number): number {
  switch (item.kind) {
    case "tab":
      return recency(item.lastAccessed, now, 15, 6);
    case "bookmark":
      // A bookmark never visited counts from when it was made.
      return frecency(item.visitCount, item.typedCount, item.lastVisitTime || item.dateAdded, now);
    case "history":
      return frecency(item.visitCount, item.typedCount, item.lastVisitTime, now);
  }
}

/** With nothing typed: most recently used first, the tab you're already on last. */
function emptyQueryScore(tab: TabItem): number {
  return (tab.isSource ? 0 : 1e15) + tab.lastAccessed;
}

export function rank(
  items: SourceItem[],
  query: string,
  { limit = MAX_RESULTS, now = Date.now() } = {},
): ScoredItem[] {
  const tokens = tokenize(query);
  const scored: ScoredItem[] = [];

  for (const item of items) {
    if (tokens.length === 0) {
      // Only open tabs show until you type; bookmarks and history wait for a query.
      if (item.kind !== "tab") continue;
      scored.push({ item, score: emptyQueryScore(item), titleMatches: [], urlMatches: [], folderMatches: [] });
      continue;
    }
    const m = matchFields(tokens, item.title, item.displayUrl, item.kind === "bookmark" ? item.folder : "");
    if (!m) continue;
    scored.push({ item, ...m, score: group(item, m.quality) * GROUP_SIZE + m.score + boost(item, now) });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
