import { Quality } from "./fuzzy";
import { MAX_RESULTS } from "./rank";
import type { PaletteItem, ScoredItem, SearchItem, UrlItem } from "./types";
import { pageKey, typedUrl } from "./url";

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

/** The row that opens what was typed, shown as typed with the full URL under it. */
export function urlItem(text: string, url: string): UrlItem {
  return { kind: "url", id: "url", title: text, url, displayUrl: url };
}

function unscored(item: PaletteItem): ScoredItem {
  return { item, score: 0, titleMatches: [], urlMatches: [], folderMatches: [] };
}

/** The best result matches at a word start, and isn't the tab you're already on. */
function matchesWell(best: ScoredItem | undefined): boolean {
  return (
    best !== undefined &&
    best.quality === Quality.WordStart &&
    !(best.item.kind === "tab" && best.item.isSource)
  );
}

/**
 * Adds rows for the typed text itself, so Enter always does something. No
 * rows when nothing has been typed.
 *
 * - "Search the web" goes first when nothing matches well (the best result
 *   doesn't match at a word start) and last otherwise.
 * - When the text looks like an address, a row that opens it goes first. A
 *   bare domain like "example.com" could be a search, so it waits below
 *   results that match well. If one of the results already is that page, it
 *   takes the row's place, so an open tab is switched to, not opened again.
 */
export function withQueryRows(results: ScoredItem[], query: string, limit = MAX_RESULTS): ScoredItem[] {
  const text = query.trim();
  if (!text) return results;
  const search = unscored(searchItem(text));

  const typed = typedUrl(text);
  if (!typed) {
    const rest = results.slice(0, limit - 1);
    return matchesWell(results[0]) ? [...rest, search] : [search, ...rest];
  }

  const key = pageKey(typed.url);
  const same = results.find((r) => !(r.item.kind === "tab" && r.item.isSource) && pageKey(r.item.url) === key);
  const open = same ?? unscored(urlItem(text, typed.url));
  const others = results.filter((r) => r !== same);
  const good = matchesWell(others[0]);
  const rest = others.slice(0, limit - 2);
  if (good && !typed.certain) return [...rest, open, search];
  return good ? [open, ...rest, search] : [open, search, ...rest];
}
