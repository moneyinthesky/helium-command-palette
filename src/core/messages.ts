import type { Favicon, PaletteItem, SourceName } from "./types";

/**
 * Requests the palette UI sends to the service worker. `sourceTabId` is the tab
 * the palette was opened from; the overlay leaves it out and the worker uses
 * the sender's tab instead. `alternate` is set when ⌘ (Ctrl elsewhere) was held.
 */
export type Request =
  | { type: "items"; source: SourceName; sourceTabId?: number }
  | { type: "execute"; item: PaletteItem; alternate: boolean; sourceTabId?: number }
  | { type: "favicons"; pageUrls: string[]; sourceTabId?: undefined };

export interface ResponseMap {
  items: PaletteItem[];
  execute: null;
  favicons: Favicon[];
}

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function request<R extends Request>(req: R): Promise<ResponseMap[R["type"]]> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<ResponseMap[R["type"]]> | undefined;
  if (!res) throw new Error(`No response to ${req.type}`);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
