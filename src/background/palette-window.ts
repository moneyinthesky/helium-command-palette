const PALETTE_URL = chrome.runtime.getURL("palette.html");
const WIDTH = 640;
const HEIGHT = 480;

/** Opens the palette in a small popup window over the source window, or closes it if open. */
export async function togglePaletteWindow(sourceTab?: chrome.tabs.Tab): Promise<void> {
  const open = (await chrome.tabs.query({})).filter((t) => t.url?.startsWith(PALETTE_URL));
  if (open.length > 0) {
    await Promise.all(open.map((t) => chrome.windows.remove(t.windowId)));
    return;
  }

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
