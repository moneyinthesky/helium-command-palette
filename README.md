# Command Palette for Helium

An Arc-style, keyboard-driven command palette for [Helium](https://helium.computer) (also works in Chrome). Manifest V3, plain TypeScript, no network requests.

> **Status:** step 1 of 6. ⌘K opens the palette in a small popup window and switches between open tabs. The in-page overlay, history, search and extension mode are coming; see [PLAN.md](PLAN.md).

## Build

```bash
pnpm install
pnpm build        # one-off build into dist/
pnpm dev          # rebuild on every save
pnpm typecheck
pnpm test         # unit tests (scorer, ranking)
pnpm test:e2e     # builds, then drives the palette in a headless Helium
```

`pnpm test:e2e` uses `/Applications/Helium.app` by default; set `BROWSER=/path/to/binary` for another Chromium build.

## Install (unpacked)

1. Run `pnpm build`.
2. Open `chrome://extensions` in Helium.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `dist/` folder.

After rebuilding, click the reload icon on the extension's card.

## Shortcut

The default is **⌘K** on macOS and **Ctrl+K** elsewhere. Press it again to close the palette. Change it at `chrome://extensions/shortcuts`.

- Chromium only applies the suggested shortcut on first install. If it clashes with another extension's shortcut, Chromium leaves it unassigned without telling you; set it by hand on the shortcuts page.
- An extension shortcut takes priority over web apps that use the same key (⌘K in Slack, Linear, GitHub and others).
- `pnpm check:shortcut` loads `dist/` into a throwaway Helium profile and reports whether the shortcut was assigned. Use `BROWSER=/path/to/binary` for another Chromium build. Recent branded Chrome ignores `--load-extension`, so check Chrome by hand.

## Using it

- Type to filter. Words can match the title or the URL, in any order (`pr github`).
- ↑/↓ or Ctrl+N/Ctrl+P to move, Enter to switch to the tab, Esc to close. Clicking outside the palette window also closes it.
- With nothing typed, tabs are listed most recently used first. The tab you opened the palette from is always last.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Read the titles and URLs of open tabs, and switch to one. |
| `favicon` | Show each row's icon from the browser's local favicon cache, without fetching it from the site. |
