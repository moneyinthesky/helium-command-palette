import type { Worker } from "@playwright/test";
import { expect, pressShortcut, test, webUrl } from "./fixtures";

const OVERLAY = "#helium-command-palette";

/** Every tab's URL. Search pages fail to load (the test browser can't resolve outside hosts) but keep their URL. */
async function tabUrls(worker: Worker): Promise<string[]> {
  return worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl ?? t.url ?? ""));
}

test.describe("web search", () => {
  test("searches with the default engine in a new tab when nothing matches", async ({ context, worker }) => {
    const page = await context.newPage();
    const startUrl = webUrl("Start page");
    await page.goto(startUrl);

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.type("zxqv lifetimes");
    const rows = overlay.locator(".row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".title")).toHaveText("Search the web for “zxqv lifetimes”");
    await expect(rows.first().locator(".badge")).toHaveText("Search");

    await page.keyboard.press("Enter");
    // Whichever engine is the default, its URL carries the query.
    await expect.poll(async () => (await tabUrls(worker)).some((u) => /zxqv(\+|%20)lifetimes/.test(u))).toBe(true);
    expect(page.url()).toBe(startUrl);
  });

  test("puts the search row last when a result matches well", async ({ context, worker }) => {
    await (await context.newPage()).goto(webUrl("Rust docs"));
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));

    await pressShortcut(worker, page);
    await expect(page.locator(OVERLAY).locator(".input")).toBeFocused();
    await page.keyboard.type("rust");
    const badges = page.locator(OVERLAY).locator(".row .badge");
    await expect(badges.first()).toHaveText("Tab");
    await expect(badges.last()).toHaveText("Search");
  });

  test("searches in the current tab with Cmd/Ctrl+Enter", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));

    await pressShortcut(worker, page);
    await expect(page.locator(OVERLAY).locator(".input")).toBeFocused();
    await page.keyboard.type("zxqv borrow");
    await expect(page.locator(OVERLAY).locator(".row .badge")).toHaveText(["Search"]);
    const tabsBefore = (await tabUrls(worker)).length;

    await page.keyboard.press("ControlOrMeta+Enter");
    // The start page's tab now holds the search (Playwright sees only the failed-load error page).
    await expect.poll(async () => (await tabUrls(worker)).some((u) => /zxqv(\+|%20)borrow/.test(u))).toBe(true);
    const urls = await tabUrls(worker);
    expect(urls).toHaveLength(tabsBefore);
    expect(urls).not.toContain(webUrl("Start page"));
  });
});
