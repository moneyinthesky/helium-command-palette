// The popup-window surface: used where the overlay can't be injected.
import { request } from "../core/messages";
import { Palette } from "../palette/palette";

const sourceTabId = Number(new URLSearchParams(location.search).get("sourceTabId")) || undefined;

async function close(): Promise<void> {
  // window.close() is unreliable for tabs the page didn't open itself.
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
  else window.close();
}

const root = document.getElementById("app")!.attachShadow({ mode: "open" });
const container = document.createElement("div");
container.className = "window";
root.append(container);

const palette = new Palette(container, {
  loadItems: () => request({ type: "snapshot", sourceTabId }),
  execute: async (item, { newTab }) => {
    await request({ type: "execute", item, newTab });
  },
  close: () => void close(),
});
palette.mount();

// Behave like a transient popup: clicking elsewhere dismisses it. Only in a real
// popup window, so the page can also be opened as a tab (e.g. in tests).
void chrome.windows.getCurrent().then((win) => {
  if (win.type === "popup") window.addEventListener("blur", () => void close());
});
window.addEventListener("focus", () => palette.focus());
