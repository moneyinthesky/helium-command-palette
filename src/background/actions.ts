import type { ActionId } from "../core/actions";
import type { PaletteItem, TabItem } from "../core/types";
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

async function runOnTab(tab: TabItem, action: ActionId): Promise<void> {
  switch (action) {
    case "open":
      // Focus the window first so the tab switch is visible straight away.
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.tabId, { active: true });
      return;
    case "closeTab":
      await chrome.tabs.remove(tab.tabId);
      return;
    case "pin":
    case "unpin":
      await chrome.tabs.update(tab.tabId, { pinned: action === "pin" });
      return;
    case "mute":
    case "unmute":
      await chrome.tabs.update(tab.tabId, { muted: action === "mute" });
      return;
    case "reload":
      await chrome.tabs.reload(tab.tabId);
      return;
    case "duplicate": {
      const copy = await chrome.tabs.duplicate(tab.tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      if (copy?.id !== undefined) await chrome.tabs.update(copy.id, { active: true });
      return;
    }
    case "moveToWindow":
      await chrome.windows.create({ tabId: tab.tabId, focused: true });
      return;
  }
  throw new Error(`Can't ${action} a tab`);
}

/** Runs an action from the palette. Copying happens in the palette itself, so it never gets here. */
export async function run(item: PaletteItem, action: ActionId, sourceTabId?: number): Promise<void> {
  if (item.kind === "tab") return runOnTab(item, action);
  // Enter opens a new tab; ⌘Enter replaces the current page.
  const inPlace = action === "openHere";
  switch (action) {
    case "open":
    case "openHere":
      return item.kind === "search" ? search(item.query, inPlace, sourceTabId) : openUrl(item.url, inPlace, sourceTabId);
    case "openWindow":
      if (item.kind === "search") {
        const text = item.query.trim();
        if (text) await chrome.search.query({ text, disposition: "NEW_WINDOW" });
        return;
      }
      if (!isOpenable(item.url)) throw new Error(`Refusing to open ${item.url}`);
      await chrome.windows.create({ url: item.url, focused: true });
      return;
  }
  throw new Error(`Can't ${action} a ${item.kind} row`);
}
