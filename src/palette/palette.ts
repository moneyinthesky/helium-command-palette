import {
  type Action,
  type ActionId,
  actionForKey,
  actionsFor,
  filterActions,
  markdownLink,
  type Shortcut,
  type ShownAction,
  tabAfter,
} from "../core/actions";
import { mergeItems } from "../core/merge";
import { rank } from "../core/rank";
import { forcedSearch, searchItem, withQueryRows } from "../core/search";
import type { PaletteItem, ScoredItem, SourceItem, TabItem } from "../core/types";
import css from "./palette.css";

/** What a surface (popup window, page overlay) provides to the palette. */
export interface PaletteHost {
  /** One promise per source; each source's items show up as soon as they arrive. */
  loadSources(): Promise<SourceItem[]>[];
  /** Favicons for the given page URLs; pages without one are left out. */
  loadIcons(pageUrls: string[]): Promise<Map<string, ImageBitmap>>;
  /**
   * Runs an action in the service worker. With `closing`, the palette closes
   * once it's done; the overlay gets out of the way first, since the action
   * may navigate the very page it's on.
   */
  run(item: PaletteItem, action: ActionId, opts: { closing: boolean }): Promise<void>;
  copy(text: string): Promise<void>;
  close(): void;
}

/** Canvas resolution for a 16 CSS px icon: sharp on 2x screens. */
const ICON_PIXELS = 32;

const KIND_LABEL: Record<PaletteItem["kind"], string> = {
  tab: "Tab",
  bookmark: "Bookmark",
  history: "History",
  search: "Search",
  url: "URL",
};

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

const PLACEHOLDER = "Search tabs, bookmarks, history or the web…";

const KEY_LABEL: Record<string, string> = { Enter: "↵", Backspace: "⌫" };

function shortcutLabel({ key, mod }: Shortcut): string {
  return `${mod ? MOD_KEY : ""}${KEY_LABEL[key] ?? key}`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

type Shapes = [tag: string, attrs: Record<string, string>][];

/** A 16×16 line icon in the text colour, from shapes given as [tag, attributes]. */
function glyph(shapes: Shapes, className = "icon"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `${className} glyph`);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}

function badge(item: PaletteItem): HTMLSpanElement {
  const badge = el("span", "badge");
  // Still a tab, so still the tab colour; the label sets it apart.
  badge.textContent = item.kind === "tab" && item.pinned ? "Pinned" : KIND_LABEL[item.kind];
  return badge;
}

/** The arrow before the row's title at the top of the actions menu. */
const backIcon = () => glyph([["path", { d: "M10 3.5 5.5 8l4.5 4.5" }]], "back");

/** Magnifying glass for the search row. */
const searchIcon = () =>
  glyph([
    ["circle", { cx: "7", cy: "7", r: "4.5" }],
    ["path", { d: "M10.5 10.5 14 14" }],
  ]);

/** Globe for an address with no favicon in the browser's cache. */
const globeIcon = () =>
  glyph([
    ["circle", { cx: "8", cy: "8", r: "6" }],
    ["ellipse", { cx: "8", cy: "8", rx: "2.6", ry: "6" }],
    ["path", { d: "M2 8h12" }],
  ]);

const SPEAKER = "M2.5 6H5l3-2.5v9L5 10H2.5z";

const SPEAKER_WAVES: Shapes = [
  ["path", { d: SPEAKER }],
  ["path", { d: "M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.4 6.4 0 0 1 0 9" }],
];
const SPEAKER_MUTED: Shapes = [
  ["path", { d: SPEAKER }],
  ["path", { d: "M10.5 6l4 4M14.5 6l-4 4" }],
];
const PIN: Shapes = [["path", { d: "M5.5 2.5h5M6.5 2.5V6l-2 2.5h7l-2-2.5V2.5M8 8.5V14" }]];
const WINDOW: Shapes = [
  ["rect", { x: "2.5", y: "3", width: "11", height: "10", rx: "1.5" }],
  ["path", { d: "M2.5 6h11" }],
];

/** An icon for each action, in the same line style as the row glyphs. */
const ACTION_ICONS: Record<ActionId, Shapes> = {
  // A new tab: a page with a plus.
  open: [
    ["path", { d: "M9 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6" }],
    ["path", { d: "M10.5 2v4M8.5 4h4" }],
  ],
  // Enter's return arrow: in place.
  openHere: [
    ["path", { d: "M12.5 3.5v4a2 2 0 0 1-2 2h-7" }],
    ["path", { d: "M6 6.5 3 9.5l3 3" }],
  ],
  openWindow: WINDOW,
  closeTab: [["path", { d: "M4.5 4.5l7 7M11.5 4.5l-7 7" }]],
  pin: PIN,
  unpin: [...PIN, ["path", { d: "M3 3l10 10" }]],
  mute: SPEAKER_MUTED,
  unmute: SPEAKER_WAVES,
  reload: [
    ["path", { d: "M12.5 8a4.5 4.5 0 1 1-1.3-3.2" }],
    ["path", { d: "M12.5 2.5v3h-3" }],
  ],
  duplicate: [
    ["rect", { x: "5.5", y: "5.5", width: "8", height: "8", rx: "1.5" }],
    ["path", { d: "M3 10.5V4a1 1 0 0 1 1-1h6.5" }],
  ],
  moveToWindow: [
    ["path", { d: "M7.5 3H3.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H12a1 1 0 0 0 1-1V8.5" }],
    ["path", { d: "M9.5 2.5h4v4M13.5 2.5 8 8" }],
  ],
  copyLink: [
    ["path", { d: "M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.75.75" }],
    ["path", { d: "M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.75-.75" }],
  ],
  // An "M" in square brackets.
  copyMarkdown: [
    ["path", { d: "M4.5 3H3v10h1.5M11.5 3H13v10h-1.5" }],
    ["path", { d: "M5.5 10.5v-5L8 8.5l2.5-3v5" }],
  ],
};

/** Switching to a tab gets an arrow into it; searching gets the magnifier, as on the search row. */
function actionIcon(item: PaletteItem, action: ActionId): SVGSVGElement {
  if (action === "open" && item.kind === "tab") {
    return glyph([["path", { d: "M2.5 8h7.5M7 5l3 3-3 3" }], ["path", { d: "M10.5 3h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2" }]]);
  }
  if (action === "open" && item.kind === "search") return searchIcon();
  return glyph(ACTION_ICONS[action]);
}

/** Small icons after a tab's title, labelled for screen readers. Pinned tabs say so on their badge instead. */
const STATE_ICONS = { audible: SPEAKER_WAVES, muted: SPEAKER_MUTED } satisfies Record<string, Shapes>;

const STATE_LABEL: Record<keyof typeof STATE_ICONS, string> = {
  audible: "Playing sound",
  muted: "Muted",
};

function stateIcons(tab: TabItem): SVGSVGElement[] {
  const states: (keyof typeof STATE_ICONS)[] = [];
  // A muted tab can still be "audible": it would be playing if it weren't muted.
  if (tab.muted) states.push("muted");
  else if (tab.audible) states.push("audible");
  return states.map((state) => {
    const svg = glyph(STATE_ICONS[state], "state");
    svg.removeAttribute("aria-hidden");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", STATE_LABEL[state]);
    return svg;
  });
}

/**
 * Adds styles to a shadow root as a constructed stylesheet. Unlike a <style>
 * element, this isn't blocked by a page's Content-Security-Policy.
 */
export function adoptCss(root: ShadowRoot, css: string): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Text with the matched characters wrapped in <mark>. Never uses innerHTML: titles are untrusted. */
function highlighted(text: string, matches: number[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  const hits = new Set(matches);
  let run = "";
  let runIsHit = false;
  const flush = () => {
    if (!run) return;
    if (runIsHit) {
      const mark = el("mark");
      mark.textContent = run;
      frag.append(mark);
    } else {
      frag.append(run);
    }
    run = "";
  };
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    if (hit !== runIsHit) {
      flush();
      runIsHit = hit;
    }
    run += text[i];
  }
  flush();
  return frag;
}

/** The actions menu for one row, shown in place of the results. */
interface Menu {
  item: PaletteItem;
  actions: Action[];
  shown: ShownAction[];
  /** What the results were filtered by, and which row was highlighted, to go back to. */
  query: string;
  resultId: string;
  resultIndex: number;
}

/** The palette panel: input plus result list. Each surface mounts it into an element inside a shadow root. */
export class Palette {
  private lists: SourceItem[][] = [];
  private items: SourceItem[] = [];
  private results: ScoredItem[] = [];
  /** The highlighted row: a result, or an action while the menu is open. */
  private selected = 0;
  private menu: Menu | null = null;
  private busy = false;

  /** Favicons by page URL, kept for as long as the palette is open. */
  private readonly icons = new Map<string, Promise<ImageBitmap | undefined>>();

  private readonly input = el("input", "input");
  private readonly crumb = el("div", "crumb");
  private readonly list = el("ul", "results");
  private readonly empty = el("div", "empty");
  private readonly hints = el("div", "hints");

  constructor(
    private readonly container: HTMLElement,
    private readonly host: PaletteHost,
  ) {}

  mount(): void {
    adoptCss(this.container.getRootNode() as ShadowRoot, css);

    const panel = el("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Command palette");

    this.input.type = "text";
    this.input.placeholder = PLACEHOLDER;
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-controls", "results");
    this.input.setAttribute("aria-expanded", "true");
    this.crumb.hidden = true;
    this.list.id = "results";
    this.list.setAttribute("role", "listbox");
    this.empty.hidden = true;

    this.hints.setAttribute("aria-hidden", "true"); // the same information is in the row's badge
    panel.append(this.input, this.crumb, this.list, this.empty, this.hints);
    this.container.append(panel);

    this.input.addEventListener("input", () => (this.menu ? this.filterMenu() : this.update(false)));
    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.focus();

    for (const [i, source] of this.host.loadSources().entries()) {
      source.then(
        (items) => {
          this.lists[i] = items;
          this.items = mergeItems(this.lists.filter(Boolean));
          // Behind an open menu, the results wait until you go back to them.
          if (this.menu) this.rerank();
          // Don't yank the highlight away from a row the user has moved to.
          else this.update(this.selected !== 0);
        },
        (err: unknown) => console.error("[palette] failed to load items", err),
      );
    }
  }

  focus(): void {
    this.input.focus();
  }

  private update(keepSelection: boolean): void {
    const selectedId = keepSelection ? this.results[this.selected]?.item.id : undefined;
    this.rerank();
    this.selected = Math.max(0, this.results.findIndex((r) => r.item.id === selectedId));
    this.render();
  }

  private rerank(): void {
    this.results = withQueryRows(rank(this.items, this.input.value), this.input.value);
  }

  /** Asks for every icon the current results need and haven't been asked for, in one request. */
  private requestIcons(): void {
    const urls = this.results.filter((r) => r.item.kind !== "search").map((r) => r.item.url);
    const missing = [...new Set(urls)].filter((u) => !this.icons.has(u));
    if (missing.length === 0) return;
    const loaded = this.host.loadIcons(missing).catch(() => new Map<string, ImageBitmap>());
    for (const url of missing) this.icons.set(url, loaded.then((icons) => icons.get(url)));
  }

  private render(): void {
    if (this.menu) {
      this.list.replaceChildren(...this.menu.shown.map((shown, i) => this.renderAction(shown, i)));
      this.empty.hidden = this.menu.shown.length > 0;
      this.empty.textContent = "No matching actions";
    } else {
      this.requestIcons();
      this.list.replaceChildren(...this.results.map((r, i) => this.renderRow(r, i)));
      this.empty.hidden = this.results.length > 0;
      // With nothing typed only tabs show, and those may not have loaded yet.
      this.empty.textContent =
        forcedSearch(this.input.value) === "" ? "Type what to search the web for" : this.input.value.trim() ? "No matches" : "";
    }
    this.syncSelection();
  }

  private renderRow(result: ScoredItem, index: number): HTMLLIElement {
    const { item } = result;
    const row = this.optionRow(index, item.kind); // styled per kind: tint and badge colour

    const icon = this.rowIcon(item);

    const text = el("div", "text");
    const line = el("div", "line");
    const title = el("div", "title");
    title.append(highlighted(item.title, result.titleMatches));
    line.append(title, ...(item.kind === "tab" ? stateIcons(item) : []));
    const url = el("div", "url");
    if (item.kind === "bookmark" && item.folder) {
      const folder = el("span", "folder");
      folder.append(highlighted(item.folder, result.folderMatches));
      url.append(folder, " · ");
    }
    if (item.kind === "tab" && item.group) {
      const group = el("span", "group");
      group.dataset.color = item.group.color;
      group.append(el("span", "dot"));
      if (item.group.title) {
        group.append(highlighted(item.group.title, result.folderMatches));
        url.append(group, " · ");
      } else {
        url.append(group, " ");
      }
    }
    url.append(highlighted(item.displayUrl, result.urlMatches));
    text.append(line, url);

    row.append(icon, text);
    if (item.kind === "tab" && item.otherWindow) {
      const where = el("span", "where");
      where.textContent = "Other window";
      row.append(where);
    }
    row.append(badge(item));
    row.addEventListener("click", (e) => {
      const actions = actionsFor(item);
      void this.perform(item, actionForKey(actions, { key: "Enter", mod: e.metaKey || e.ctrlKey })!);
    });
    return row;
  }

  private renderAction({ action, matches }: ShownAction, index: number): HTMLLIElement {
    const row = this.optionRow(index, "action");
    row.dataset.tone = action.tone; // the icon chip's colour
    const chip = el("span", "chip");
    chip.append(actionIcon(this.menu!.item, action.id));
    const label = el("div", "title");
    label.append(highlighted(action.label, matches));
    row.append(chip, label);
    if (action.shortcut) {
      const kbd = el("kbd");
      kbd.textContent = shortcutLabel(action.shortcut);
      row.append(kbd);
    }
    row.addEventListener("click", () => this.menu && void this.perform(this.menu.item, action));
    return row;
  }

  /** A selectable row that follows the mouse and leaves focus in the input. */
  private optionRow(index: number, kind: string): HTMLLIElement {
    const row = el("li", "row");
    row.id = `row-${index}`;
    row.dataset.kind = kind;
    row.setAttribute("role", "option");
    row.addEventListener("mousemove", () => {
      if (this.selected !== index) {
        this.selected = index;
        this.syncSelection();
      }
    });
    row.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
    return row;
  }

  private rowIcon(item: PaletteItem): Element {
    return item.kind === "search" ? searchIcon() : this.favicon(item.url, item.kind === "url" ? globeIcon : undefined);
  }

  /** The page's favicon, or `fallback` in its place when the browser has none cached. */
  private favicon(pageUrl: string, fallback?: () => Element): HTMLCanvasElement {
    const canvas = el("canvas", "icon");
    canvas.width = canvas.height = ICON_PIXELS;
    void this.icons.get(pageUrl)?.then((bitmap) => {
      if (bitmap) canvas.getContext("2d")?.drawImage(bitmap, 0, 0, ICON_PIXELS, ICON_PIXELS);
      else if (fallback) canvas.replaceWith(fallback());
    });
    return canvas;
  }

  private rowCount(): number {
    return this.menu ? this.menu.shown.length : this.results.length;
  }

  private syncSelection(): void {
    for (const [i, row] of [...this.list.children].entries()) {
      const on = i === this.selected;
      row.setAttribute("aria-selected", String(on));
      if (on) row.scrollIntoView({ block: "nearest" });
    }
    if (this.rowCount() > 0) {
      this.input.setAttribute("aria-activedescendant", `row-${this.selected}`);
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
    this.renderHints();
  }

  private renderHints(): void {
    const hints: [string, string][] = [];
    const item = this.results[this.selected]?.item;
    if (this.menu) {
      hints.push(["↵", "Run"], ["esc", "Back"]);
    } else if (item) {
      // What Enter and ⌘Enter do; the rest are in the actions menu.
      for (const { label, shortcut } of actionsFor(item)) {
        if (shortcut?.key === "Enter") hints.push([shortcutLabel(shortcut), label]);
      }
      hints.push(["⇥", "Actions"]);
      // A way to search without going down to the search row.
      if (item.kind !== "search" && this.typedSearch()) hints.push(["⇧↵", "Search the web"]);
      hints.push(["esc", "Close"]);
    } else {
      hints.push(["esc", "Close"]);
    }
    this.hints.replaceChildren(
      ...hints.map(([key, action]) => {
        const hint = el("span", "hint");
        const kbd = el("kbd");
        kbd.textContent = key;
        hint.append(kbd, ` ${action}`);
        return hint;
      }),
    );
  }

  private move(delta: number): void {
    const n = this.rowCount();
    if (n === 0) return;
    this.selected = (this.selected + delta + n) % n;
    this.syncSelection();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.isComposing) return;
    const ctrlOnly = e.ctrlKey && !e.metaKey && !e.altKey;
    const mod = e.metaKey || e.ctrlKey;
    const plain = !mod && !e.altKey && !e.shiftKey;
    const atEnd = this.input.selectionStart === this.input.value.length && this.input.selectionEnd === this.input.value.length;
    if (e.key === "ArrowDown" || (ctrlOnly && e.key === "n")) {
      this.move(1);
    } else if (e.key === "ArrowUp" || (ctrlOnly && e.key === "p")) {
      this.move(-1);
    } else if (e.key === "Tab" && plain) {
      if (this.menu) this.closeMenu();
      else this.openMenu();
    } else if (e.key === "ArrowRight" && plain && atEnd && !this.menu && this.results.length > 0) {
      this.openMenu();
    } else if (e.key === "ArrowLeft" && plain && this.menu && this.input.value === "") {
      this.closeMenu();
    } else if (e.key === "Escape") {
      if (this.menu) this.closeMenu();
      else this.host.close();
    } else if (e.key === "Enter" && this.menu) {
      const shown = this.menu.shown[this.selected];
      if (shown) void this.perform(this.menu.item, shown.action);
    } else if (e.key === "Enter" && e.shiftKey) {
      const search = this.typedSearch();
      if (search) void this.perform(search, actionForKey(actionsFor(search), { key: "Enter", mod })!);
    } else {
      // Shortcuts for the highlighted row, or the row the menu is for: Enter, ⌘Enter, ⌘⌫.
      const item = this.menu?.item ?? this.results[this.selected]?.item;
      const action = item && !e.altKey && !e.shiftKey ? actionForKey(actionsFor(item), { key: e.key, mod }) : undefined;
      // Anything else, Backspace on a row without ⌘⌫ included, edits the text as usual.
      if (!item || !action) return;
      void this.perform(item, action);
    }
    e.preventDefault();
  }

  /** Shows what you can do with the highlighted row, in place of the results. */
  private openMenu(): void {
    const result = this.results[this.selected];
    if (!result) return;
    const actions = actionsFor(result.item);
    this.menu = {
      item: result.item,
      actions,
      shown: filterActions(actions, ""),
      query: this.input.value,
      resultId: result.item.id,
      resultIndex: this.selected,
    };
    this.input.value = "";
    this.input.placeholder = "Filter actions…";
    // The row the actions are for, in its own colour, which the actions that go somewhere share.
    const title = el("span", "crumb-title");
    title.textContent = result.item.title;
    this.crumb.replaceChildren(backIcon(), this.rowIcon(result.item), title, badge(result.item));
    this.crumb.dataset.kind = result.item.kind;
    this.list.dataset.for = result.item.kind;
    this.crumb.hidden = false;
    this.selected = 0;
    this.render();
  }

  private filterMenu(): void {
    if (!this.menu) return;
    this.menu.shown = filterActions(this.menu.actions, this.input.value);
    this.selected = 0;
    this.render();
  }

  /** Back to the results, as they were: same text, same row highlighted. */
  private closeMenu(): void {
    this.leaveMenu();
    this.render();
  }

  private leaveMenu(): void {
    const menu = this.menu;
    if (!menu) return;
    this.menu = null;
    this.input.value = menu.query;
    this.input.placeholder = PLACEHOLDER;
    this.crumb.hidden = true;
    delete this.list.dataset.for;
    // Results may have changed behind the menu, as more sources loaded.
    const index = this.results.findIndex((r) => r.item.id === menu.resultId);
    this.selected = index >= 0 ? index : Math.min(menu.resultIndex, Math.max(0, this.results.length - 1));
  }

  /** A web search for what was typed, whichever row is highlighted. */
  private typedSearch(): PaletteItem | undefined {
    const text = forcedSearch(this.input.value) ?? this.input.value.trim();
    return text ? searchItem(text) : undefined;
  }

  private async perform(item: PaletteItem, action: Action): Promise<void> {
    if (this.busy) return;
    if (item.kind === "tab" && action.staysOpen) {
      this.applyToTab(item, action.id);
      return;
    }
    this.busy = true;
    try {
      if (action.id === "copyLink") await this.host.copy(item.url);
      else if (action.id === "copyMarkdown") await this.host.copy(markdownLink(item.title, item.url));
      else await this.host.run(item, action.id, { closing: true });
    } catch (err) {
      console.error("[palette] action failed", err);
    } finally {
      this.host.close();
    }
  }

  /**
   * Runs an action that keeps the palette open (close, pin, mute, reload) and
   * updates the tab's row straight away, back in the results with the
   * highlight on it, or in its place if the tab was closed.
   */
  private applyToTab(tab: TabItem, action: ActionId): void {
    const after = tabAfter(tab, action);
    this.lists = this.lists.map((list) => list.flatMap((item) => (item.id !== tab.id ? [item] : after ? [after] : [])));
    // A closed tab's history entry or bookmark comes back, since the page is no longer open.
    this.items = mergeItems(this.lists.filter(Boolean));
    this.leaveMenu();
    const index = this.selected;
    this.rerank();
    const same = this.results.findIndex((r) => r.item.id === tab.id);
    this.selected = same >= 0 ? same : Math.min(index, Math.max(0, this.results.length - 1));
    this.render();
    this.host.run(tab, action, { closing: false }).catch((err: unknown) => console.error("[palette] action failed", err));
  }
}
