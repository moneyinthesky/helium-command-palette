import type { GroupColor, TabGroup, TabItem } from "../../core/types";
import { toDisplayUrl } from "../../core/url";
import type { Provider } from "./types";

const ownOrigin = chrome.runtime.getURL("");

async function groupsById(): Promise<Map<number, TabGroup>> {
  const groups = await chrome.tabGroups.query({});
  return new Map(groups.map((g) => [g.id, { title: g.title ?? "", color: g.color as GroupColor }]));
}

export const tabsProvider: Provider = {
  async getItems({ sourceTabId }) {
    const [tabs, groups] = await Promise.all([chrome.tabs.query({}), groupsById()]);
    const sourceWindowId = tabs.find((t) => t.id === sourceTabId)?.windowId;
    const items: TabItem[] = [];
    for (const tab of tabs) {
      // Skip the palette's own window and anything without an id.
      if (tab.id === undefined || tab.url?.startsWith(ownOrigin)) continue;
      const url = tab.url ?? tab.pendingUrl ?? "";
      const displayUrl = toDisplayUrl(url);
      items.push({
        kind: "tab",
        id: `tab:${tab.id}`,
        tabId: tab.id,
        windowId: tab.windowId,
        title: tab.title || displayUrl,
        url,
        displayUrl,
        lastAccessed: tab.lastAccessed ?? 0,
        isSource: tab.id === sourceTabId,
        otherWindow: sourceWindowId !== undefined && tab.windowId !== sourceWindowId,
        pinned: tab.pinned,
        audible: tab.audible ?? false,
        muted: tab.mutedInfo?.muted ?? false,
        group: groups.get(tab.groupId),
      });
    }
    return items;
  },
};
