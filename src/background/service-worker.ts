import type { Request, Response } from "../core/messages";
import type { PaletteItem } from "../core/types";
import { execute } from "./actions";
import { togglePalette } from "./launcher";
import { tabsProvider } from "./providers/tabs";
import type { Provider, ProviderContext } from "./providers/types";

const PALETTE_COMMAND = "toggle-palette";
const providers: Provider[] = [tabsProvider];

async function snapshot(ctx: ProviderContext): Promise<PaletteItem[]> {
  const lists = await Promise.all(providers.map((p) => p.getItems(ctx)));
  return lists.flat();
}

async function handleRequest(req: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (req.type) {
    case "snapshot":
      // The overlay doesn't know its tab id, but the sender does.
      return snapshot({ sourceTabId: req.sourceTabId ?? sender.tab?.id });
    case "execute":
      await execute(req.item, req.newTab);
      return null;
  }
}

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  handleRequest(req, sender).then(
    (data) => sendResponse({ ok: true, data } satisfies Response),
    (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies Response),
  );
  return true; // respond asynchronously
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === PALETTE_COMMAND) void togglePalette(tab);
});

if (__E2E__) {
  // Playwright can't press extension shortcuts, so tests call this instead.
  Object.assign(globalThis, { __test: { togglePalette } });
}

chrome.runtime.onInstalled.addListener(async () => {
  // Chromium leaves the shortcut unassigned, without telling the user, when the
  // suggested key clashes. Log it so it shows up in the worker console.
  const commands = await chrome.commands.getAll();
  const palette = commands.find((c) => c.name === PALETTE_COMMAND);
  if (!palette?.shortcut) {
    console.warn("[palette] shortcut not assigned; set one at chrome://extensions/shortcuts");
  }
});
