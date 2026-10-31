import type { BookmarkItem, HistoryItem, SourceItem } from "./types";
import { pageKey, titleKey } from "./url";

/** Every key under which an item counts as "the same page" as another. */
function sameKeys(item: SourceItem): string[] {
  const byTitle = titleKey(item.url, item.title);
  return byTitle ? [pageKey(item.url), byTitle] : [pageKey(item.url)];
}

/**
 * Combines items from every source, showing each page once: as a tab if it's
 * open, else as a bookmark, else as history. A bookmark takes over the visit
 * counts of the history entry it hides, so it ranks by how much you use it.
 */
export function mergeItems(lists: SourceItem[][]): SourceItem[] {
  const all = lists.flat();
  const open = new Set(all.filter((i) => i.kind === "tab").flatMap(sameKeys));
  const isOpen = (i: SourceItem) => sameKeys(i).some((k) => open.has(k));

  const bookmarks: BookmarkItem[] = [];
  const bookmarksByKey = new Map<string, number[]>();
  for (const item of all) {
    if (item.kind !== "bookmark" || isOpen(item)) continue;
    bookmarks.push({ ...item });
    for (const k of sameKeys(item)) bookmarksByKey.set(k, [...(bookmarksByKey.get(k) ?? []), bookmarks.length - 1]);
  }

  const history: HistoryItem[] = [];
  for (const item of all) {
    if (item.kind !== "history" || isOpen(item)) continue;
    // A page bookmarked in two folders gets the visits on both.
    const matches = new Set(sameKeys(item).flatMap((k) => bookmarksByKey.get(k) ?? []));
    if (matches.size === 0) {
      history.push(item);
      continue;
    }
    for (const index of matches) {
      const b = bookmarks[index]!;
      bookmarks[index] = {
        ...b,
        lastVisitTime: Math.max(b.lastVisitTime, item.lastVisitTime),
        visitCount: b.visitCount + item.visitCount,
        typedCount: b.typedCount + item.typedCount,
      };
    }
  }

  return [...all.filter((i) => i.kind === "tab"), ...bookmarks, ...history];
}

/**
 * Collapses history entries for the same page (same pageKey or titleKey) into
 * one: the most recently visited URL and title, with visit counts added up.
 */
export function dedupeHistory(items: HistoryItem[]): HistoryItem[] {
  const merged: HistoryItem[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const keys = sameKeys(item);
    const index = keys.map((k) => indexByKey.get(k)).find((i) => i !== undefined);
    if (index === undefined) {
      merged.push(item);
      for (const k of keys) indexByKey.set(k, merged.length - 1);
      continue;
    }
    const seen = merged[index]!;
    const [newer, older] = item.lastVisitTime > seen.lastVisitTime ? [item, seen] : [seen, item];
    merged[index] = {
      ...newer,
      visitCount: newer.visitCount + older.visitCount,
      typedCount: newer.typedCount + older.typedCount,
    };
    for (const k of keys) if (!indexByKey.has(k)) indexByKey.set(k, index);
  }
  return merged;
}
