export const PALETTE_COMMAND = "toggle-palette";

export async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (command !== PALETTE_COMMAND) return;
  // Step 0: prove the shortcut reaches the worker. The palette itself lands in step 1.
  console.log(`[palette] ${command} fired`, { tabId: tab?.id, url: tab?.url });
}

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab);
});

chrome.runtime.onInstalled.addListener(async () => {
  // Chromium leaves the shortcut unassigned, without telling the user, when the
  // suggested key clashes. Log it so it shows up in the worker console.
  const commands = await chrome.commands.getAll();
  const palette = commands.find((c) => c.name === PALETTE_COMMAND);
  if (!palette?.shortcut) {
    console.warn("[palette] shortcut not assigned; set one at chrome://extensions/shortcuts");
  } else {
    console.log(`[palette] shortcut: ${palette.shortcut}`);
  }
});
