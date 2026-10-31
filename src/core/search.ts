import { Quality } from "./fuzzy";
import { MAX_RESULTS } from "./rank";
import type { ScoredItem, SearchItem } from "./types";

export function searchItem(query: string): SearchItem {
  return {
    kind: "search",
    id: "search",
    title: `Search the web for “${query}”`,
    url: "",
    displayUrl: "Your default search engine",
    query,
  };
}

/**
 * Adds the "search the web" row, so Enter always does something. It goes first
 * when nothing matches well (the best result doesn't match at a word start)
 * and last otherwise. No row when nothing has been typed.
 */
export function withSearchRow(results: ScoredItem[], query: string, limit = MAX_RESULTS): ScoredItem[] {
  const text = query.trim();
  if (!text) return results;
  const row: ScoredItem = { item: searchItem(text), score: 0, titleMatches: [], urlMatches: [], folderMatches: [] };
  const best = results[0];
  const matchesWell =
    best !== undefined &&
    best.quality === Quality.WordStart &&
    !(best.item.kind === "tab" && best.item.isSource);
  const rest = results.slice(0, limit - 1);
  return matchesWell ? [...rest, row] : [row, ...rest];
}
