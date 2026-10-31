import type { Quality } from "./fuzzy";

/** Fields every palette row shares, whatever provider produced it. */
interface BaseItem {
  /** Stable across snapshots, e.g. "tab:123". */
  id: string;
  title: string;
  /** Full URL, used for opening and favicons. */
  url: string;
  /** URL without scheme or "www.", shown in the row and matched against. */
  displayUrl: string;
}

export interface TabItem extends BaseItem {
  kind: "tab";
  tabId: number;
  windowId: number;
  /** Epoch ms of the last time the tab was focused. */
  lastAccessed: number;
  /** The tab the palette was opened from; ranked last. */
  isSource: boolean;
}

export interface HistoryItem extends BaseItem {
  kind: "history";
  /** Epoch ms of the most recent visit. */
  lastVisitTime: number;
  visitCount: number;
  /** Visits where the URL was typed into the address bar: a strong signal of intent. */
  typedCount: number;
}

/** The "search the web" row. Built from the query, not loaded from a source. */
export interface SearchItem extends BaseItem {
  kind: "search";
  query: string;
}

/** Items loaded from a source and ranked against the query. */
export type SourceItem = TabItem | HistoryItem;

/** Every kind of row; extension items join in a later step. */
export type PaletteItem = SourceItem | SearchItem;

/** Where palette items come from. Each is loaded separately so fast ones show first. */
export const SOURCES = ["tabs", "history"] as const;
export type SourceName = (typeof SOURCES)[number];

export interface ScoredItem {
  item: PaletteItem;
  score: number;
  /** Where the query matched; absent with an empty query or for the search row. */
  quality?: Quality;
  /** Character positions in `item.title` that matched the query. */
  titleMatches: number[];
  /** Character positions in `item.displayUrl` that matched the query. */
  urlMatches: number[];
}

/** A favicon's image bytes, sent from the service worker to the palette. */
export interface Favicon {
  pageUrl: string;
  mime: string;
  base64: string;
}
