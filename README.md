# Command Palette for Helium

An Arc-style, keyboard-driven command palette for [Helium](https://helium.computer) (also works in Chrome). Manifest V3, plain TypeScript, no network requests.

> **Status:** step 3 of 6. ⌘K opens the palette over the current page and searches open tabs and history. The search row and extension mode are coming; see [PLAN.md](PLAN.md).

## Build

```bash
pnpm install
pnpm build        # one-off build into dist/
pnpm dev          # rebuild on every save
pnpm typecheck
pnpm test         # unit tests (scorer, ranking)
pnpm test:e2e     # test build into dist-e2e/, then drives it in a headless Helium
```

`pnpm test:e2e` uses a separate test build (`dist-e2e/`) that can open the overlay without a real key press and leaves its Shadow DOM inspectable. Don't load that build as your everyday extension. It uses `/Applications/Helium.app` by default; set `BROWSER=/path/to/binary` for another Chromium build.

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
- ↑/↓ or Ctrl+N/Ctrl+P to move, Esc to close. Clicking outside the palette also closes it.
- **Enter** switches to a tab, or opens a history page in a new tab next to the current one. **⌘Enter** (Ctrl+Enter elsewhere) opens a history page in the current tab instead. From an empty new tab, Enter reuses that tab.
- Results come from open tabs and your 2,000 most recent history pages. Each page appears once: if it's open it shows only as its tab, and repeat visits collapse into one history entry. Two URLs count as the same page when they differ only in the `#fragment`, tracking parameters (`utm_*`, `fbclid`, `gclid`, `ref` and similar), `www.`, a trailing slash, or site-specific tracking (YouTube timestamps, Amazon's click tracking). They also count as the same when they share a site, path and page title, which catches tracking parameters nobody has listed. Other query strings still count, so different YouTube videos or Google searches stay separate.
- Results are ordered first by where your text matches: the start of a word (in the title, or a URL segment like `amazon` in `amazon.co.uk`) beats a match inside a word, which beats letters scattered through the title. Within each of those, open tabs come before history. So `ama` finds Amazon before a tab titled "Vivek Ramaswamy", but `rama` puts that tab first.
- After that, more recently used items rank higher; for history, so do pages you visit often or typed into the address bar.
- With nothing typed: open tabs, most recently used first, then recent history shown dimmed. The tab you opened the palette from is always last. Once you type, matching history is shown at full strength.

## Where it appears

On ordinary web pages the palette opens as an overlay on top of the page, inside a closed Shadow DOM so the page's styles can't affect it and the page's scripts can't read it.

Browsers don't let extensions draw on some pages: `chrome://` pages, other extensions' pages, the Web Store, and pages the browser blocks scripts on. There the palette opens in a small separate window instead, which closes when you click away.

## Known limitations

- **Restricted pages** get the separate window, not the overlay (see above).
- **Page shortcuts:** keys you type in the overlay are kept from the page's normal key handlers. A page that listens in the capture phase can still see them, though few do.
- **Fullscreen:** the overlay doesn't show over fullscreen video. Exit fullscreen first.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Read the titles and URLs of open tabs, and switch to one. |
| `history` | Search your browsing history. It's read locally when the palette opens and never leaves the browser. |
| `favicon` | Show each row's icon from the browser's local favicon cache, without fetching it from the site. |
| `activeTab` | When you press the shortcut, lets the extension add the overlay to *that* tab only. No access to any page until you press it. |
| `scripting` | Adds the overlay to the page (used together with `activeTab`). |

There are no host permissions: the extension can't read or change pages on its own.

The favicon cache (`_favicon/*`) is listed as a web-accessible resource so the overlay can show icons inside web pages. It uses `use_dynamic_url`, so sites can't use it to detect that the extension is installed.
