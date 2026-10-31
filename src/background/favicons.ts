import type { Favicon } from "../core/types";

/** Pixel size requested from the cache: sharp at 16 CSS px on 2x screens. */
const SIZE = 32;
/** One palette screen's worth; more is never needed at once. */
const MAX_PER_REQUEST = 20;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Reads favicons from the browser's local cache (no network request) and
 * returns their bytes. The overlay can't load extension URLs inside a web
 * page, so it draws these instead. Pages with no cached icon are left out.
 */
export async function getFavicons(pageUrls: string[]): Promise<Favicon[]> {
  const results = await Promise.all(
    pageUrls.slice(0, MAX_PER_REQUEST).map(async (pageUrl): Promise<Favicon | null> => {
      try {
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", pageUrl);
        url.searchParams.set("size", String(SIZE));
        const res = await fetch(url);
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { pageUrl, mime: res.headers.get("content-type") ?? "image/png", base64: toBase64(bytes) };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((f) => f !== null);
}
