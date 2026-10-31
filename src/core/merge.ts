import type { HistoryItem, PaletteItem } from "./types";
import { pageKey, titleKey } from "./url";

/** Every key under which an item counts as "the same page" as another. */
function sameKeys(item: PaletteItem): string[] {
  const byTitle = titleKey(item.url, item.title);
  return byTitle ? [pageKey(item.url), byTitle] : [pageKey(item.url)];
}

/**
 * Combines items from every source. A page that's open in a tab only appears
 * as the tab, never again as a history entry.
 */
export function mergeItems(lists: PaletteItem[][]): PaletteItem[] {
  const all = lists.flat();
  const open = new Set(all.filter((i) => i.kind === "tab").flatMap(sameKeys));
  return all.filter((i) => i.kind !== "history" || !sameKeys(i).some((k) => open.has(k)));
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
