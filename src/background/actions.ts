import type { PaletteItem } from "../core/types";
import { isOpenable } from "../core/url";

/** Pages with nothing worth keeping: opening something replaces them instead of adding a tab. */
const BLANK_PAGES = new Set(["about:blank", "chrome://newtab/", "chrome://new-tab-page/"]);

/**
 * The tab to show a result in: the source tab itself when `inPlace` is set or
 * it's an empty new-tab page, otherwise a new tab next to it.
 */
async function targetTab(
  inPlace: boolean,
  sourceTabId: number | undefined,
  url?: string,
): Promise<{ tabId: number; isNew: boolean }> {
  const source = sourceTabId === undefined ? undefined : await chrome.tabs.get(sourceTabId).catch(() => undefined);
  if (source?.id !== undefined && (inPlace || BLANK_PAGES.has(source.url ?? ""))) {
    return { tabId: source.id, isNew: false };
  }
  const tab = await chrome.tabs.create({ url, windowId: source?.windowId, index: source ? source.index + 1 : undefined });
  return { tabId: tab.id!, isNew: true };
}

async function openUrl(url: string, inPlace: boolean, sourceTabId?: number): Promise<void> {
  if (!isOpenable(url)) throw new Error(`Refusing to open ${url}`);
  const { tabId, isNew } = await targetTab(inPlace, sourceTabId, url);
  if (!isNew) await chrome.tabs.update(tabId, { url });
}

/** Resolves once the tab has finished loading, or after `timeoutMs` regardless. */
function loaded(tabId: number, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === "complete") done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    void chrome.tabs.get(tabId).then((t) => t.status === "complete" && done(), done);
  });
}

/** Searches with the browser's default engine, whichever the user picked. */
async function search(query: string, inPlace: boolean, sourceTabId?: number): Promise<void> {
  const text = query.trim();
  if (!text) return;
  const { tabId, isNew } = await targetTab(inPlace, sourceTabId, "about:blank");
  // A new tab's own initial load would cancel a search started before it finishes.
  if (isNew) await loaded(tabId);
  await chrome.search.query({ text, tabId });
}

export async function execute(item: PaletteItem, alternate: boolean, sourceTabId?: number): Promise<void> {
  switch (item.kind) {
    case "tab":
      // Focus the window first so the tab switch is visible straight away.
      await chrome.windows.update(item.windowId, { focused: true });
      await chrome.tabs.update(item.tabId, { active: true });
      return;
    // Enter opens a new tab; ⌘Enter replaces the current page.
    case "bookmark":
    case "history":
    case "url":
      await openUrl(item.url, alternate, sourceTabId);
      return;
    case "search":
      await search(item.query, alternate, sourceTabId);
      return;
  }
}
