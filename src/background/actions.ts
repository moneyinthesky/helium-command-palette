import type { PaletteItem } from "../core/types";

export async function execute(item: PaletteItem, _newTab: boolean): Promise<void> {
  switch (item.kind) {
    case "tab":
      // Focus the window first so the tab switch is visible straight away.
      await chrome.windows.update(item.windowId, { focused: true });
      await chrome.tabs.update(item.tabId, { active: true });
      return;
  }
}
