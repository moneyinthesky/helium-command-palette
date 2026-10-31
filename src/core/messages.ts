import type { PaletteItem } from "./types";

/** Requests the palette UI sends to the service worker. */
export type Request =
  | { type: "snapshot"; sourceTabId?: number }
  | { type: "execute"; item: PaletteItem; newTab: boolean };

export interface ResponseMap {
  snapshot: PaletteItem[];
  execute: null;
}

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function request<R extends Request>(req: R): Promise<ResponseMap[R["type"]]> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<ResponseMap[R["type"]]> | undefined;
  if (!res) throw new Error(`No response to ${req.type}`);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
