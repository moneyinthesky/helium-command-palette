import type { Request, Response } from "../core/messages";
import type { PaletteItem } from "../core/types";
import { execute } from "./actions";
import { togglePaletteWindow } from "./palette-window";
import { tabsProvider } from "./providers/tabs";
import type { Provider, ProviderContext } from "./providers/types";

const PALETTE_COMMAND = "toggle-palette";
const providers: Provider[] = [tabsProvider];

async function snapshot(ctx: ProviderContext): Promise<PaletteItem[]> {
  const lists = await Promise.all(providers.map((p) => p.getItems(ctx)));
  return lists.flat();
}

async function handleRequest(req: Request): Promise<unknown> {
  switch (req.type) {
    case "snapshot":
      return snapshot({ sourceTabId: req.sourceTabId });
    case "execute":
      await execute(req.item, req.newTab);
      return null;
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handleRequest(req).then(
    (data) => sendResponse({ ok: true, data } satisfies Response),
    (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies Response),
  );
  return true; // respond asynchronously
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === PALETTE_COMMAND) void togglePaletteWindow(tab);
});

chrome.runtime.onInstalled.addListener(async () => {
  // Chromium leaves the shortcut unassigned, without telling the user, when the
  // suggested key clashes. Log it so it shows up in the worker console.
  const commands = await chrome.commands.getAll();
  const palette = commands.find((c) => c.name === PALETTE_COMMAND);
  if (!palette?.shortcut) {
    console.warn("[palette] shortcut not assigned; set one at chrome://extensions/shortcuts");
  }
});
