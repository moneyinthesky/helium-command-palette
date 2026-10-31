# Command Palette for Helium

An Arc-style, keyboard-driven command palette for [Helium](https://helium.computer). It also works in Chrome. Press **⌘K** and type to jump to an open tab, open a bookmark, reopen something from your history, go to an address, or search the web.

Manifest V3, plain TypeScript, no frameworks. It makes no network requests of its own and has no analytics.

## Install

You need [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build
```

Then in Helium (or Chrome):

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist/` folder.

After pulling changes, run `pnpm build` again and click the reload icon on the extension's card. Pages that were already open may keep the previous overlay until you refresh them.

## Using it

Press **⌘K** (Ctrl+K on Windows and Linux) on any page. Press it again, press Esc, or click outside to close.

| Key | Does |
|---|---|
| Type | Filter. Words can match the title, the URL or a bookmark's folder, in any order (`pr github`). |
| ↑ ↓ or Ctrl+N / Ctrl+P | Move the highlight |
| Enter | Switch to a tab, or open a bookmark, history page, address or web search in a new tab next to the current one |
| ⌘Enter (Ctrl+Enter) | Open a bookmark, history page, address or web search in the current tab instead |
| ⌘⌫ (Ctrl+⌫) | Close the highlighted tab. The palette stays open, so you can close several in a row. On other rows the key edits your text as usual. |
| Esc | Close |

The footer shows what Enter and ⌘Enter will do for the highlighted row. From an empty new tab, Enter reuses that tab rather than opening another.

### What you can find

- **Open tabs** in every window.
- **Bookmarks**, by title, URL or the folders they're in (`recipes` finds everything in a Recipes folder). The folder path shows next to the URL. The top-level folders (bookmarks bar, Other bookmarks) are left out of it.
- **History:** your 2,000 most recent pages.
- **Addresses:** type something that looks like a URL (`github.com/anthropics`, `localhost:3000`, `https://…`, `chrome://extensions`) and a row opens it directly. `localhost`, `*.localhost` and IP addresses open over `http://`; other addresses without a scheme get `https://`. If a tab or bookmark is already that page, it takes the row's place, so Enter switches to the open tab instead of opening it again. Words ending in a file extension, like `node.js`, count as searches.
- **Web search:** once you type, there's always a "Search the web" row, so Enter always does something. It uses Helium's default search engine (Settings → Search engine). Nothing is sent to the search engine until you choose that row: there are no live suggestions.

With nothing typed you see only open tabs, most recently used first, with the tab you're on last. Bookmarks and history appear once you type.

### How results are ordered

1. **Where your text matches.** The start of a word in the title, or a URL segment like `amazon` in `amazon.co.uk`, beats a match inside a word, which beats letters scattered through the title. So `ama` finds Amazon before a tab titled "Vivek Ramaswamy", but `rama` puts that tab first.
2. **Open tabs, then bookmarks, then history**, among equally good matches.
3. **Recency**, and for bookmarks and history, how often you visit a page and whether you typed it into the address bar.

The search row goes first when nothing matches at the start of a word, and last otherwise. An address row goes first when the text is clearly an address (it has a scheme, path, port, `localhost` or an IP address). A bare domain like `example.com` goes first only when nothing else matches at the start of a word, since it might be a search.

### Duplicates

Each page appears once. A page that's open shows only as its tab; otherwise a bookmarked page shows as the bookmark, ranked by its history visits. Repeat visits collapse into one history entry.

Two URLs count as the same page when they differ only in:
- the `#fragment`
- tracking parameters: `utm_*`, `fbclid`, `gclid`, `ref` and similar
- `www.` or a trailing slash
- site-specific tracking: YouTube timestamps, Amazon's click tracking

They also count as the same when they share a site, path and page title, which catches tracking parameters nobody has listed. Other query strings still count, so different YouTube videos or Google searches stay separate.

## Where it appears

On ordinary web pages the palette opens as an overlay on top of the page. It sits inside a closed Shadow DOM, so the page's styles can't affect it and the page's scripts can't read it.

Browsers don't let extensions draw on some pages: `chrome://` pages, the new-tab page, other extensions' pages, the Web Store, and pages where the browser blocks scripts. There the palette opens in a small separate window instead, which closes when you click away.

## Shortcut

The default is ⌘K on macOS and Ctrl+K elsewhere. To change it, go to `chrome://extensions/shortcuts`.

- Chromium only applies the default shortcut on first install. If it clashes with another extension's shortcut, Chromium leaves it unassigned without telling you, so set it by hand on the shortcuts page.
- An extension shortcut takes priority over web apps that use the same key: ⌘K in Slack, Linear, GitHub and others opens this palette instead.

## Known limitations

- **Restricted pages** get the separate window, not the overlay (see above).
- **Page shortcuts:** keys you type in the overlay are hidden from the page's normal key handlers. A page that listens in the capture phase can still see them, though few do.
- **Fullscreen:** the overlay doesn't show over fullscreen video. Exit fullscreen first.
- **History depth:** only the 2,000 most recent pages are searched.
- **Not built (yet):** extension mode (`>` to list, enable and disable extensions), recently closed tabs, and custom commands. See [PLAN.md](PLAN.md). Triggering another extension's toolbar button or commands isn't possible with Chromium's APIs.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | Read the titles and URLs of open tabs, and switch to one. |
| `bookmarks` | Search your bookmarks. They're only read, never changed. |
| `history` | Search your browsing history. It's read locally when the palette opens and never leaves the browser. |
| `search` | Run a web search with your default search engine when you choose the search row. |
| `favicon` | Read each row's icon from the browser's local favicon cache, without fetching it from the site. |
| `activeTab` | When you press the shortcut, lets the extension add the overlay to *that* tab only. It has no access to any page until you press it. |
| `scripting` | Adds the overlay to the page (used together with `activeTab`). |

There are no host permissions, so the extension can't read or change pages on its own. It exposes nothing to web pages (no web-accessible resources), so sites can't probe for it. Favicons are read by the service worker from the browser's cache and drawn by the palette; the page never loads an extension URL.

## Development

```bash
pnpm dev             # rebuild dist/ on every save
pnpm typecheck
pnpm test            # unit tests: matching, ranking, de-duplication, search row
pnpm test:e2e        # end-to-end tests in a headless Helium
pnpm check:shortcut  # does the browser assign the shortcut to a fresh install?
pnpm icons           # re-render src/icons/*.png from assets/icon.svg (uses Helium)
```

- **End-to-end tests** use a separate test build in `dist-e2e/`. It can open the overlay without a real key press, has access to every site, and leaves its Shadow DOM inspectable. Don't load it as your everyday extension. The test browser can only reach a local test server, never the internet.
- **Browser:** the end-to-end tests and `check:shortcut` use `/Applications/Helium.app` by default. Set `BROWSER=/path/to/binary` for another Chromium build. Recent branded Chrome ignores the `--load-extension` flag these rely on, so check Chrome by hand.
- **Manual checks:** a real key press, window focus and how things look can't be automated. Use [TESTING.md](TESTING.md) before a release.

### Layout

| Path | What's there |
|---|---|
| `src/background/` | Service worker: the shortcut, opening the overlay or window, actions, favicons |
| `src/background/providers/` | Sources of results (tabs, bookmarks, history). New sources go here. |
| `src/core/` | Pure logic shared by both sides: matching, ranking, de-duplication, the search row, messages |
| `src/palette/` | The palette UI, shared by both surfaces |
| `src/overlay/` | The in-page overlay (injected content script) |
| `src/popup/` | The separate-window fallback |
| `tests/unit/`, `tests/e2e/` | Vitest and Playwright tests |
| `assets/icon.svg` | Source for the extension icon; `pnpm icons` renders the PNGs into `src/icons/` |

## Licence

[MIT](LICENSE)
