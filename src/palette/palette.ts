import { mergeItems } from "../core/merge";
import { rank } from "../core/rank";
import { withSearchRow } from "../core/search";
import type { PaletteItem, ScoredItem, SourceItem } from "../core/types";
import css from "./palette.css";

/** What a surface (popup window, page overlay) provides to the palette. */
export interface PaletteHost {
  /** One promise per source; each source's items show up as soon as they arrive. */
  loadSources(): Promise<SourceItem[]>[];
  /** Favicons for the given page URLs; pages without one are left out. */
  loadIcons(pageUrls: string[]): Promise<Map<string, ImageBitmap>>;
  /** `alternate`: ⌘ (Ctrl elsewhere) was held, asking for the item's secondary action. */
  execute(item: PaletteItem, opts: { alternate: boolean }): Promise<void>;
  close(): void;
}

/** Canvas resolution for a 16 CSS px icon: sharp on 2x screens. */
const ICON_PIXELS = 32;

const KIND_LABEL: Record<PaletteItem["kind"], string> = {
  tab: "Tab",
  bookmark: "Bookmark",
  history: "History",
  search: "Search",
};

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Footer hints for the highlighted row, so ⌘Enter is discoverable. */
const HINTS: Record<PaletteItem["kind"], [key: string, action: string][]> = {
  tab: [["↵", "Switch to tab"]],
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
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Magnifying glass for the search row, drawn in the text colour. */
function searchIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon glyph");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "7");
  circle.setAttribute("cy", "7");
  circle.setAttribute("r", "4.5");
  const handle = document.createElementNS(SVG_NS, "path");
  handle.setAttribute("d", "M10.5 10.5 14 14");
  svg.append(circle, handle);
  return svg;
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
    this.results = withSearchRow(rank(this.items, this.input.value), this.input.value);
    this.selected = Math.max(0, this.results.findIndex((r) => r.item.id === selectedId));
    this.render();
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
    this.empty.textContent = this.input.value.trim() ? "No matches" : "";
    this.syncSelection();
  }

  private renderRow(result: ScoredItem, index: number): HTMLLIElement {
    const { item } = result;
    const row = el("li", "row");
    row.id = `row-${index}`;
    row.dataset.kind = item.kind; // styled per kind: tint and badge colour
    row.setAttribute("role", "option");

    const icon = item.kind === "search" ? searchIcon() : this.favicon(item.url);

    const text = el("div", "text");
    const title = el("div", "title");
    title.append(highlighted(item.title, result.titleMatches));
    const url = el("div", "url");
    if (item.kind === "bookmark" && item.folder) {
      const folder = el("span", "folder");
      folder.append(highlighted(item.folder, result.folderMatches));
      url.append(folder, " · ");
    }
    url.append(highlighted(item.displayUrl, result.urlMatches));
    text.append(title, url);

    const badge = el("span", "badge");
    badge.textContent = KIND_LABEL[item.kind];

    row.append(icon, text, badge);
    row.addEventListener("mousemove", () => {
      if (this.selected !== index) {
        this.selected = index;
        this.syncSelection();
      }
    });
    row.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
    row.addEventListener("click", (e) => void this.run(index, e.metaKey || e.ctrlKey));
    return row;
  }

  private favicon(pageUrl: string): HTMLCanvasElement {
    const canvas = el("canvas", "icon");
    canvas.width = canvas.height = ICON_PIXELS;
    void this.icons.get(pageUrl)?.then((bitmap) => {
      if (bitmap) canvas.getContext("2d")?.drawImage(bitmap, 0, 0, ICON_PIXELS, ICON_PIXELS);
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
    const hints: [string, string][] = [...(kind ? HINTS[kind] : []), ["esc", "Close"]];
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
    } else if (e.key === "Enter" && !e.isComposing) {
      void this.run(this.selected, e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      this.host.close();
    } else {
      return;
    }
    e.preventDefault();
  }

  private async run(index: number, alternate: boolean): Promise<void> {
    const result = this.results[index];
    if (!result || this.busy) return;
    this.busy = true;
    try {
      await this.host.execute(result.item, { alternate });
    } catch (err) {
      console.error("[palette] action failed", err);
    } finally {
      this.host.close();
    }
  }
}
