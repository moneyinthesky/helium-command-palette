import type { SourceItem } from "../../core/types";

export interface ProviderContext {
  /** The tab the palette was opened from, if any. */
  sourceTabId?: number;
}

/** A source of palette rows. Tabs, bookmarks and history today; extensions later. */
export interface Provider {
  getItems(ctx: ProviderContext): Promise<SourceItem[]>;
}
