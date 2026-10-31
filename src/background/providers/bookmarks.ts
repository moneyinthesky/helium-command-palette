import type { BookmarkItem } from "../../core/types";
import { isOpenable, toDisplayUrl } from "../../core/url";
import type { Provider } from "./types";

function collect(nodes: chrome.bookmarks.BookmarkTreeNode[], folders: string[], out: BookmarkItem[]): void {
  for (const node of nodes) {
    if (node.children) {
      collect(node.children, [...folders, node.title], out);
      continue;
    }
    if (!node.url || !isOpenable(node.url)) continue;
    const displayUrl = toDisplayUrl(node.url);
    out.push({
      kind: "bookmark",
      id: `bookmark:${node.id}`,
      title: node.title || displayUrl,
      url: node.url,
      displayUrl,
      folder: folders.join(" / "),
      dateAdded: node.dateAdded ?? 0,
      // Filled in from history when the two sources are merged.
      lastVisitTime: 0,
      visitCount: 0,
      typedCount: 0,
    });
  }
}

export const bookmarksProvider: Provider = {
  async getItems() {
    const [root] = await chrome.bookmarks.getTree();
    const items: BookmarkItem[] = [];
    // The root's children are the bookmarks bar, "Other bookmarks" and so on.
    // Every bookmark is in one, so their names are left out of the folder path.
    for (const top of root?.children ?? []) collect(top.children ?? [], [], items);
    return items;
  },
};
