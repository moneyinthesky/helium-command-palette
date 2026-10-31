import { mergeItems } from "../core/merge";
import { rank } from "../core/rank";
import type { PaletteItem, ScoredItem } from "../core/types";
import css from "./palette.css";

/** What a surface (popup window, page overlay) provides to the palette. */
export interface PaletteHost {
  /** One promise per source; each source's items show up as soon as they arrive. */
  loadSources(): Promise<PaletteItem[]>[];
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
  history: "History",
};

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
  private lists: PaletteItem[][] = [];
  private items: PaletteItem[] = [];
  private results: ScoredItem[] = [];
  private selected = 0;
  private busy = false;

  /** Favicons by page URL, kept for as long as the palette is open. */
  private readonly icons = new Map<string, Promise<ImageBitmap | undefined>>();

  private readonly input = el("input", "input");
  private readonly list = el("ul", "results");
  private readonly empty = el("div", "empty");

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
    this.input.placeholder = "Search tabs and history…";
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-controls", "results");
    this.input.setAttribute("aria-expanded", "true");
    this.list.id = "results";
    this.list.setAttribute("role", "listbox");
    this.empty.hidden = true;

    panel.append(this.input, this.list, this.empty);
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
    this.results = rank(this.items, this.input.value);
    this.selected = Math.max(0, this.results.findIndex((r) => r.item.id === selectedId));
    this.render();
  }

  /** Asks for every icon the current results need and haven't been asked for, in one request. */
  private requestIcons(): void {
    const missing = [...new Set(this.results.map((r) => r.item.url))].filter((u) => !this.icons.has(u));
    if (missing.length === 0) return;
    const loaded = this.host.loadIcons(missing).catch(() => new Map<string, ImageBitmap>());
    for (const url of missing) this.icons.set(url, loaded.then((icons) => icons.get(url)));
  }

  private render(): void {
    this.requestIcons();
    this.list.replaceChildren(...this.results.map((r, i) => this.renderRow(r, i)));
    this.empty.hidden = this.results.length > 0;
    this.empty.textContent = this.items.length === 0 ? "" : "No matches";
    this.syncSelection();
  }

  private renderRow(result: ScoredItem, index: number): HTMLLIElement {
    const { item } = result;
    const row = el("li", "row");
    row.id = `row-${index}`;
    // With nothing typed, history is just filler under the tabs: show it quieter.
    if (item.kind === "history" && this.input.value.trim() === "") row.classList.add("dim");
    row.setAttribute("role", "option");

    const icon = el("canvas", "icon");
    icon.width = icon.height = ICON_PIXELS;
    void this.icons.get(item.url)?.then((bitmap) => {
      if (bitmap) icon.getContext("2d")?.drawImage(bitmap, 0, 0, ICON_PIXELS, ICON_PIXELS);
    });

    const text = el("div", "text");
    const title = el("div", "title");
    title.append(highlighted(item.title, result.titleMatches));
    const url = el("div", "url");
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
