import { closePaletteWindows, openPaletteWindow } from "./palette-window";

/**
 * Opens or closes the palette for the shortcut. Prefers the in-page overlay;
 * falls back to a popup window where content scripts can't run (chrome://
 * pages, other extensions, the Web Store) or when there's no tab.
 */
export async function togglePalette(tab?: chrome.tabs.Tab): Promise<void> {
  if (await closePaletteWindows()) return;

  if (tab?.id !== undefined) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["overlay.js"],
        // Don't wait for a slow page to finish loading.
        injectImmediately: true,
      });
      return;
    } catch {
      // Restricted page: fall through to the window.
    }
  }

  await openPaletteWindow(tab);
}
