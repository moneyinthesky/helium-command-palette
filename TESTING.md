# Manual test checklist

`pnpm test` and `pnpm test:e2e` cover matching, ranking, de-duplication and most behaviour in a headless Helium. They can't press a real extension shortcut, see which window has focus, or judge how things look. Run through this list before a release, in Helium and then in Chrome.

## Setup

1. Run `pnpm build`, then load or reload `dist/` in `chrome://extensions`.
2. Open two windows:
   - **Window A:** three or four sites you know, including one that uses ⌘K itself (GitHub, Slack or Linear).
   - **Window B:** two more sites.
3. Have some history the tabs don't cover: visit a couple of sites, then close their tabs.
4. Open DevTools on a normal page and keep its console visible for the checks below.

## Shortcut

- [ ] `chrome://extensions/shortcuts` shows "Open the command palette" bound to ⌘K (Ctrl+K on Windows and Linux).
- [ ] ⌘K on a normal page opens the overlay, with the cursor in the input.
- [ ] ⌘K on a site that uses ⌘K itself opens this palette, not the site's.
- [ ] ⌘K again closes it.

## Overlay

- [ ] The dimmed backdrop covers the page, and the palette is centred near the top.
- [ ] Esc closes it. If you were typing in a page field before, the cursor goes back there.
- [ ] Clicking the dimmed area closes it.
- [ ] While typing in the palette, the page's own keyboard shortcuts don't fire. Try GitHub's `s` or `t`.
- [ ] Favicons show, and the console has no "Unsafe attempt to load URL" or other errors.
- [ ] After rebuilding and reloading the extension *without* refreshing the page, ⌘K still works and shows the new build.

## Fallback window

- [ ] ⌘K on `chrome://extensions` opens a small separate window centred over the browser window, instead of the overlay.
- [ ] The same happens on a new-tab page and on `chrome://settings`.
- [ ] Clicking another window closes it, and so do Esc and ⌘K.

## Tabs

- [ ] With nothing typed: tabs from both windows, most recently used first. The tab you're on is last.
- [ ] Enter on a tab in the other window brings that window to the front on that tab, and the palette closes.
- [ ] Clicking a row does the same.
- [ ] A pinned tab's badge says **Pinned**, in the same colour as other tabs. With nothing typed, it keeps its place by recency; when you type, it comes before other tabs that match about as well.
- [ ] A tab playing sound shows a speaker, and a muted one a crossed-out speaker. Both stay visible when the title is too long to fit.
- [ ] A tab in a named group shows the group's colour and name before its URL, in the same colour as the tab strip, in light and dark mode. A tab in an unnamed group shows just the colour.
- [ ] Typing a group's name lists the tabs in that group.
- [ ] Tabs in the other window say "Other window"; tabs in this one don't.
- [ ] ⌘⌫ (Ctrl+⌫) on a highlighted tab closes it. Its row disappears, the palette stays open, and the highlight stays on the row that moved up.
- [ ] ⌘⌫ on the search row deletes the text instead of closing anything.

## History

- [ ] With nothing typed, no history appears, only tabs.
- [ ] Typing part of a closed site's name finds it with a **History** badge.
- [ ] Enter opens it in a new tab directly to the right of the current one.
- [ ] ⌘Enter opens it in the current tab instead.
- [ ] From an empty new tab (fallback window), Enter opens it in that same tab, with no extra tab.
- [ ] A site that's open in a tab doesn't also appear as history, even if the URLs differ by tracking parameters (for example, `?utm_source=…`).

## Bookmarks

- [ ] With nothing typed, no bookmarks appear, not even ones you've visited.
- [ ] Typing part of a bookmark's title finds it with a **Bookmark** badge and its folder path before the URL, e.g. "Work / Docs · example.com".
- [ ] Typing a folder's name finds the bookmarks in it, with the folder name highlighted.
- [ ] Enter opens it in a new tab next to the current one; ⌘Enter opens it in the current tab.
- [ ] A bookmarked page you've visited shows once, as the bookmark, not also as history. If it's open in a tab, it shows only as the tab.

## Web search

- [ ] Typing something that matches nothing shows only "Search the web for …" with a magnifier icon.
- [ ] Enter searches with Helium's default engine (Settings → Search engine) in a new tab next to the current one.
- [ ] ⌘Enter searches in the current tab.
- [ ] When a tab or history page matches at the start of a word, the search row moves to the bottom.
- [ ] With a tab or history row highlighted, ⇧Enter searches for what you typed in a new tab, and ⇧⌘Enter in the current tab. The footer shows "⇧↵ Search the web".
- [ ] Typing `?` alone shows "Type what to search the web for". `?github.com` shows only the search row, and Enter searches instead of opening the site.

## Addresses

- [ ] Typing `example.org/some/path` shows a **URL** row first. Enter opens `https://example.org/some/path` in a new tab next to the current one; ⌘Enter opens it in the current tab.
- [ ] Typing `localhost:3000` opens `http://localhost:3000/`, not `https://`.
- [ ] Typing the address of a page that's open in a tab shows that tab first, with no URL row. Enter switches to it.
- [ ] Typing `node.js` shows no URL row, only results and the search row.
- [ ] The URL row shows the site's favicon if you've visited it before, and a globe otherwise.

## Ranking

- [ ] Typing the start of a word in a history title (say `ama` for Amazon) ranks it above a tab that only contains those letters mid-word (`Ramaswamy`).
- [ ] Typing the start of a word in that tab's title (`rama`) puts the tab first.
- [ ] Between equally good matches, tabs come before history.

## Keyboard and footer

- [ ] ↑/↓ and Ctrl+N/Ctrl+P move the highlight and wrap at the ends.
- [ ] The footer shows "↵ Switch to tab" and "⇥ Actions" on tabs, and "↵ Open in new tab" plus "⌘↵ Open here" on history.

## Actions menu

- [ ] Tab on a row shows its actions, under a header showing that row (favicon, title, badge, in the row's colour), and the cursor stays in the input. → does the same when the cursor is at the end of your text, and otherwise just moves the cursor.
- [ ] Typing filters the actions; Enter runs the highlighted one. Esc, Tab, or ← with nothing typed goes back to the results with your text and highlight as they were. Esc again closes the palette.
- [ ] Pin, Mute and Reload on a tab do that to the tab, keep the palette open, and update the row (badge **Pinned**, muted speaker).
- [ ] Mute is only listed for a tab playing sound. A muted tab lists Unmute, even after it goes quiet. A silent, unmuted tab lists neither.
- [ ] Duplicate opens a copy and switches to it. Move to new window moves the tab into a window of its own and brings it to the front.
- [ ] Open in new window works for history, bookmarks, addresses and the search row.
- [ ] Copy link and Copy as Markdown link paste correctly in another app, from the overlay on an `https://` page, on a plain `http://` page (which uses a fallback), and from the separate window on `chrome://extensions`.
- [ ] On Windows and Linux, the footer says `Ctrl+↵` instead of `⌘↵`.

## Appearance

- [ ] Light mode: readable, with a clearly visible highlighted row.
- [ ] Dark mode (System Settings → Appearance): the overlay and the fallback window both switch to dark.
- [ ] Long titles and URLs are cut off with "…" rather than wrapping.
- [ ] In the actions menu, every action has an icon in a coloured square: actions that go somewhere in the row's colour (blue for tabs, magenta for bookmarks, amber for history, green for search), copying in violet, tab changes in slate, closing in red. The highlighted action is tinted in its own colour, in light and dark mode.

## Chrome

- [ ] Repeat the **Shortcut**, **Overlay**, **Fallback window** and **History** sections in Chrome. `pnpm test:e2e` and `pnpm check:shortcut` can't load the extension into branded Chrome.
