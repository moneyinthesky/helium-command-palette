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

/** Union of every item kind; history, search and extension items join in later steps. */
export type PaletteItem = TabItem;

export interface ScoredItem {
  item: PaletteItem;
  score: number;
  /** Character positions in `item.title` that matched the query. */
  titleMatches: number[];
  /** Character positions in `item.displayUrl` that matched the query. */
  urlMatches: number[];
}
