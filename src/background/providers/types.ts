import type { PaletteItem } from "../../core/types";

export interface ProviderContext {
  /** The tab the palette was opened from, if any. */
  sourceTabId?: number;
}

/** A source of palette rows. Tabs and history today; search and extensions later. */
export interface Provider {
  getItems(ctx: ProviderContext): Promise<PaletteItem[]>;
}
