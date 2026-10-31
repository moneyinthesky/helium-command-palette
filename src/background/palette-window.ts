const PALETTE_URL = chrome.runtime.getURL("palette.html");
const WIDTH = 640;
const HEIGHT = 480;

/** Closes any open palette windows. Returns whether there were any. */
export async function closePaletteWindows(): Promise<boolean> {
  const open = (await chrome.tabs.query({})).filter((t) => t.url?.startsWith(PALETTE_URL));
  await Promise.all(open.map((t) => chrome.windows.remove(t.windowId)));
  return open.length > 0;
}

/** Opens the palette in a small popup window centred over the source window. */
export async function openPaletteWindow(sourceTab?: chrome.tabs.Tab): Promise<void> {
  const anchor = sourceTab
    ? await chrome.windows.get(sourceTab.windowId)
    : await chrome.windows.getLastFocused({ windowTypes: ["normal"] });

  const url = new URL(PALETTE_URL);
  if (sourceTab?.id !== undefined) url.searchParams.set("sourceTabId", String(sourceTab.id));

  await chrome.windows.create({
    url: url.href,
    type: "popup",
    focused: true,
    width: WIDTH,
    height: HEIGHT,
    left: Math.round((anchor.left ?? 0) + ((anchor.width ?? WIDTH) - WIDTH) / 2),
    top: Math.round((anchor.top ?? 0) + (anchor.height ?? HEIGHT) / 6),
  });
}
