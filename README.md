# Command Palette for Helium

An Arc-style, keyboard-driven command palette for [Helium](https://helium.computer) (also works in Chrome). Manifest V3, plain TypeScript, no network requests.

> **Status:** step 0 (scaffold). The shortcut is wired up and logs to the service worker console; the palette UI arrives in step 1. See [PLAN.md](PLAN.md).

## Build

```bash
pnpm install
pnpm build        # one-off build into dist/
pnpm dev          # rebuild on every save
pnpm typecheck
```

## Install (unpacked)

1. Run `pnpm build`.
2. Open `chrome://extensions` in Helium.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `dist/` folder.

After rebuilding, click the reload icon on the extension's card.

## Shortcut

The default is **⌘K** on macOS and **Ctrl+K** elsewhere. Change it at `chrome://extensions/shortcuts`.

- Chromium only applies the suggested shortcut on first install. If it clashes with another extension's shortcut, Chromium leaves it unassigned without telling you; set it by hand on the shortcuts page.
- An extension shortcut takes priority over web apps that use the same key (⌘K in Slack, Linear, GitHub and others).
- `pnpm check:shortcut` loads `dist/` into a throwaway Helium profile and reports whether the shortcut was assigned. Use `BROWSER=/path/to/binary` for another Chromium build. Recent branded Chrome ignores `--load-extension`, so check Chrome by hand.

To confirm the key actually reaches the extension: on the extension's card in `chrome://extensions`, click **service worker** to open its console, then press ⌘K on any page. You should see `[palette] toggle-palette fired`.
