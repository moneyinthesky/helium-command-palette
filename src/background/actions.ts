import type { PaletteItem } from "../core/types";
import { isOpenable } from "../core/url";

/** Pages with nothing worth keeping: opening something replaces them instead of adding a tab. */
const BLANK_PAGES = new Set(["about:blank", "chrome://newtab/", "chrome://new-tab-page/"]);

/**
 * Opens `url` in a new tab next to the source tab, or in the source tab itself
 * when `inPlace` is set or the source tab is an empty new-tab page.
 */
async function openUrl(url: string, inPlace: boolean, sourceTabId?: number): Promise<void> {
  if (!isOpenable(url)) throw new Error(`Refusing to open ${url}`);
  const source = sourceTabId === undefined ? undefined : await chrome.tabs.get(sourceTabId).catch(() => undefined);
  if (source?.id !== undefined && (inPlace || BLANK_PAGES.has(source.url ?? ""))) {
    await chrome.tabs.update(source.id, { url });
  } else {
    await chrome.tabs.create({ url, windowId: source?.windowId, index: source ? source.index + 1 : undefined });
  }
}

export async function execute(item: PaletteItem, alternate: boolean, sourceTabId?: number): Promise<void> {
  switch (item.kind) {
    case "tab":
      // Focus the window first so the tab switch is visible straight away.
      await chrome.windows.update(item.windowId, { focused: true });
      await chrome.tabs.update(item.tabId, { active: true });
      return;
    case "history":
      // Enter opens a new tab; ⌘Enter replaces the current page.
      await openUrl(item.url, alternate, sourceTabId);
      return;
  }
}
