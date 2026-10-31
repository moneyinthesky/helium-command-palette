import type { TabItem } from "../../core/types";
import { toDisplayUrl } from "../../core/url";
import type { Provider } from "./types";

const ownOrigin = chrome.runtime.getURL("");

export const tabsProvider: Provider = {
  async getItems({ sourceTabId }) {
    const tabs = await chrome.tabs.query({});
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
      });
    }
    return items;
  },
};
