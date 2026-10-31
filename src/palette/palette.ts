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
  /** `alternate`: ⌘ (Ctrl elsewhere) was held, asking for the item's secondary action. */
  execute(item: PaletteItem, opts: { alternate: boolean }): Promise<void>;
  closeTab(tabId: number): Promise<void>;
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

/** Footer hints for the highlighted row, so ⌘Enter is discoverable. */
const HINTS: Record<PaletteItem["kind"], [key: string, action: string][]> = {
  tab: [
    ["↵", "Switch to tab"],
    [`${MOD_KEY}⌫`, "Close tab"],
  ],
  bookmark: [
    ["↵", "Open in new tab"],
    [`${MOD_KEY}↵`, "Open here"],
  ],
  history: [
    ["↵", "Open in new tab"],
    [`${MOD_KEY}↵`, "Open here"],
  ],
  search: [
    ["↵", "Search in new tab"],
    [`${MOD_KEY}↵`, "Search here"],
  ],
  url: [
    ["↵", "Open in new tab"],
    [`${MOD_KEY}↵`, "Open here"],
  ],
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** A 16×16 line icon in the text colour, from shapes given as [tag, attributes]. */
function glyph(shapes: [tag: string, attrs: Record<string, string>][], className = "icon"): SVGSVGElement {
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

/** Small icons after a tab's title, labelled for screen readers. Pinned tabs say so on their badge instead. */
const STATE_ICONS = {
  audible: [
    ["path", { d: SPEAKER }],
    ["path", { d: "M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.4 6.4 0 0 1 0 9" }],
  ],
  muted: [
    ["path", { d: SPEAKER }],
    ["path", { d: "M10.5 6l4 4M14.5 6l-4 4" }],
  ],
} satisfies Record<string, [string, Record<string, string>][]>;

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

/** The palette panel: input plus result list. Each surface mounts it into an element inside a shadow root. */
export class Palette {
  private lists: SourceItem[][] = [];
  private items: SourceItem[] = [];
  private results: ScoredItem[] = [];
  private selected = 0;
  private busy = false;

  /** Favicons by page URL, kept for as long as the palette is open. */
  private readonly icons = new Map<string, Promise<ImageBitmap | undefined>>();

  private readonly input = el("input", "input");
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
    this.input.placeholder = "Search tabs, bookmarks, history or the web…";
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-controls", "results");
    this.input.setAttribute("aria-expanded", "true");
    this.list.id = "results";
    this.list.setAttribute("role", "listbox");
    this.empty.hidden = true;

    this.hints.setAttribute("aria-hidden", "true"); // the same information is in the row's badge
    panel.append(this.input, this.list, this.empty, this.hints);
    this.container.append(panel);

    this.input.addEventListener("input", () => this.update(false));
    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.focus();

    for (const [i, source] of this.host.loadSources().entries()) {
      source.then(
        (items) => {
          this.lists[i] = items;
          this.items = mergeItems(this.lists.filter(Boolean));
          // Don't yank the highlight away from a row the user has moved to.
          this.update(this.selected !== 0);
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
    this.requestIcons();
    this.list.replaceChildren(...this.results.map((r, i) => this.renderRow(r, i)));
    this.empty.hidden = this.results.length > 0;
    // With nothing typed only tabs show, and those may not have loaded yet.
    this.empty.textContent =
      forcedSearch(this.input.value) === "" ? "Type what to search the web for" : this.input.value.trim() ? "No matches" : "";
    this.syncSelection();
  }

  private renderRow(result: ScoredItem, index: number): HTMLLIElement {
    const { item } = result;
    const row = el("li", "row");
    row.id = `row-${index}`;
    row.dataset.kind = item.kind; // styled per kind: tint and badge colour
    row.setAttribute("role", "option");

    const icon =
      item.kind === "search" ? searchIcon() : this.favicon(item.url, item.kind === "url" ? globeIcon : undefined);

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

    const badge = el("span", "badge");
    // Still a tab, so still the tab colour; the label sets it apart.
    badge.textContent = item.kind === "tab" && item.pinned ? "Pinned" : KIND_LABEL[item.kind];

    row.append(icon, text);
    if (item.kind === "tab" && item.otherWindow) {
      const where = el("span", "where");
      where.textContent = "Other window";
      row.append(where);
    }
    row.append(badge);
    row.addEventListener("mousemove", () => {
      if (this.selected !== index) {
        this.selected = index;
        this.syncSelection();
      }
    });
    row.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
    row.addEventListener("click", (e) => void this.run(this.results[index]?.item, e.metaKey || e.ctrlKey));
    return row;
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

  private syncSelection(): void {
    for (const [i, row] of [...this.list.children].entries()) {
      const on = i === this.selected;
      row.setAttribute("aria-selected", String(on));
      if (on) row.scrollIntoView({ block: "nearest" });
    }
    if (this.results.length > 0) {
      this.input.setAttribute("aria-activedescendant", `row-${this.selected}`);
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
    this.renderHints();
  }

  private renderHints(): void {
    const kind = this.results[this.selected]?.item.kind;
    const hints: [string, string][] = [...(kind ? HINTS[kind] : [])];
    // A way to search without going down to the search row.
    if (kind && kind !== "search" && this.typedSearch()) hints.push(["⇧↵", "Search the web"]);
    hints.push(["esc", "Close"]);
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
    const n = this.results.length;
    if (n === 0) return;
    this.selected = (this.selected + delta + n) % n;
    this.syncSelection();
  }

  private onKeyDown(e: KeyboardEvent): void {
    const ctrlOnly = e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "ArrowDown" || (ctrlOnly && e.key === "n")) {
      this.move(1);
    } else if (e.key === "ArrowUp" || (ctrlOnly && e.key === "p")) {
      this.move(-1);
    } else if (e.key === "Enter" && e.shiftKey && !e.isComposing) {
      void this.run(this.typedSearch(), e.metaKey || e.ctrlKey);
    } else if (e.key === "Enter" && !e.isComposing) {
      void this.run(this.results[this.selected]?.item, e.metaKey || e.ctrlKey);
    } else if (e.key === "Backspace" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && this.highlightedTab()) {
      // Only on a tab row: elsewhere the key edits the text as usual.
      this.closeTab(this.highlightedTab()!);
    } else if (e.key === "Escape") {
      this.host.close();
    } else {
      return;
    }
    e.preventDefault();
  }

  private highlightedTab(): TabItem | undefined {
    const item = this.results[this.selected]?.item;
    return item?.kind === "tab" ? item : undefined;
  }

  /** Closes the tab and drops its row, keeping the palette open and the highlight in place. */
  private closeTab(tab: TabItem): void {
    const index = this.selected;
    this.lists = this.lists.map((list) => list.filter((item) => item.id !== tab.id));
    // A history entry or bookmark it was hiding comes back, since the page is no longer open.
    this.items = mergeItems(this.lists.filter(Boolean));
    this.rerank();
    this.selected = Math.min(index, Math.max(0, this.results.length - 1));
    this.render();
    this.host.closeTab(tab.tabId).catch((err: unknown) => console.error("[palette] failed to close tab", err));
  }

  /** A web search for what was typed, whichever row is highlighted. */
  private typedSearch(): PaletteItem | undefined {
    const text = forcedSearch(this.input.value) ?? this.input.value.trim();
    return text ? searchItem(text) : undefined;
  }

  private async run(item: PaletteItem | undefined, alternate: boolean): Promise<void> {
    if (!item || this.busy) return;
    this.busy = true;
    try {
      await this.host.execute(item, { alternate });
    } catch (err) {
      console.error("[palette] action failed", err);
    } finally {
      this.host.close();
    }
  }
}
