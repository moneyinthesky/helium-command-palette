import { dedupeHistory } from "../../core/merge";
import type { HistoryItem } from "../../core/types";
import { isOpenable, toDisplayUrl } from "../../core/url";
import type { Provider } from "./types";

/** Most recent pages to search. ~25 ms to fetch in Helium; matching runs in the palette. */
const MAX_HISTORY = 2000;

export const historyProvider: Provider = {
  async getItems() {
    // startTime defaults to 24 hours ago; 0 means all of history.
    const results = await chrome.history.search({ text: "", startTime: 0, maxResults: MAX_HISTORY });
    const items: HistoryItem[] = [];
    for (const h of results) {
      if (!h.url || !isOpenable(h.url)) continue;
      const displayUrl = toDisplayUrl(h.url);
      items.push({
        kind: "history",
        id: `history:${h.url}`,
        title: h.title || displayUrl,
        url: h.url,
        displayUrl,
        lastVisitTime: h.lastVisitTime ?? 0,
        visitCount: h.visitCount ?? 0,
        typedCount: h.typedCount ?? 0,
      });
    }
    return dedupeHistory(items);
  },
};
