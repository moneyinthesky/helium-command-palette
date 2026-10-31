import { request } from "../core/messages";

/**
 * Fetches favicons for `pageUrls` through the service worker and decodes them.
 * Works the same in the overlay and the popup window: nothing is loaded by URL,
 * so neither a page's security policy nor its origin can get in the way.
 */
export async function loadIcons(pageUrls: string[]): Promise<Map<string, ImageBitmap>> {
  const favicons = await request({ type: "favicons", pageUrls });
  const icons = new Map<string, ImageBitmap>();
  await Promise.all(
    favicons.map(async ({ pageUrl, mime, base64 }) => {
      try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        icons.set(pageUrl, await createImageBitmap(new Blob([bytes], { type: mime })));
      } catch {
        // Undecodable icon: leave that row blank.
      }
    }),
  );
  return icons;
}
