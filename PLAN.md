# Brief: Arc-style command palette extension for Helium

## Goal
Build a Chromium MV3 extension (target browser: Helium, a privacy-focused ungoogled-chromium fork; must also work in Chrome) that opens a fast, keyboard-driven command palette, similar to Arc's, from a single shortcut. Loaded unpacked for now; no Web Store publishing.

## Shortcut
- Use `chrome.commands` with a **Cmd + single character** binding (`"mac": "Command+K"` as the suggested default, `Ctrl+K` elsewhere).
- Chromium rejects or ignores some Cmd+letter combos that the browser already owns (e.g. T, W, N, L, R). Verify the chosen default actually registers in Helium. If it doesn't, pick another free Cmd+letter and document the choice in the README.
- Note in the README that users can rebind at `chrome://extensions/shortcuts`. Known trade-off: an extension shortcut overrides web apps that use the same key (e.g. Cmd+K in Slack, Linear, GitHub).

## Features (build in this order)
1. **Tab switching.** All open tabs across all windows (`chrome.tabs.query({})`). Selecting one focuses the tab and its window. The current tab is excluded or ranked last.
2. **History search.** `chrome.history.search`. De-duplicate against open tabs (if a URL is open, show only the tab).
3. **Google search.** An always-present row: "Search Google for '<query>'". It opens `https://www.google.com/search?q=<encoded>` in a new tab. **No live search suggestions** in v1 (privacy; avoids sending keystrokes to Google).
4. **Extension mode.** Triggered by typing a `>` prefix. Lists installed extensions (`chrome.management.getAll`, excluding self) with actions:
   - Enable or disable the extension
   - Open its options page (if it has one)
   - Open its popup page in a new tab, if one is declared. Caveat: some popups break outside the toolbar context, so label this accordingly.

   Chromium has no API to click another extension's toolbar button or fire its commands. Don't try to fake this.

## Ranking & UX
- Show one unified list. Order: open tabs first, then history, with the Google search row at the top when nothing matches well and last otherwise. Enter must always do something.
- Fuzzy-match on title and URL (a small custom scorer or Fuse.js), with a recency/frecency boost (tabs: `lastAccessed`; history: `lastVisitTime` and `visitCount`).
- Keyboard: ↑/↓ (also Ctrl+N/Ctrl+P) to move, Enter to open, Cmd+Enter to open the result in a new tab where applicable, Esc to close. The input auto-focuses on open.
- Cap results at about 8–10 rows. Show a favicon, title and muted URL for each. Highlight matched characters.
- Must feel instant: no visible lag on open or while typing.

## Presentation
- **Default: an overlay.** The content script injects a centred modal into the current page inside a **Shadow DOM**, so page CSS can't leak in or out, with a dimmed backdrop. Clicking outside or pressing Esc closes it.
- **Fallback: a popup window.** On pages where content scripts can't run (`chrome://`, `chrome-extension://`, the Web Store, the PDF viewer, pages still loading), open the same palette UI via `chrome.windows.create({ type: "popup" })`, centred and small. It closes on blur.
- Share a single palette UI component between the two surfaces.
- Data access: the service worker answers queries (tabs, history, management) over messaging. Keep the worker stateless. Cache an index briefly where it helps speed.

## Tech constraints
- Manifest V3, plain TypeScript. Use a minimal build (esbuild or Vite); avoid heavy frameworks unless clearly justified.
- Minimum permissions: `tabs`, `history`, `management`, `scripting`, `activeTab`. Use host permissions only as needed for injection; justify each in the README.
- No network requests, analytics or remote code.
- Respect dark and light mode (`prefers-color-scheme`).

## Deliverables
- Source, with a build script producing a `dist/` folder loadable via `chrome://extensions` → Developer mode → Load unpacked.
- A README covering install, the shortcut and how to rebind it, features, known limitations (overlay doesn't work on restricted pages, extension-triggering limits, shortcut conflicts) and the permission rationale.
- Manual test checklist: overlay on a normal page; fallback on `chrome://extensions`; tab switch across windows; history result opens; Google search row; `>` extension mode toggles an extension; Esc and click-outside close it; dark mode.

## Out of scope (v1)
Search suggestions, bookmarks, recently closed tabs, custom commands (copy URL, pin, etc.), new-tab override, settings UI. Keep the code structured so these can be added as new "providers" later.
