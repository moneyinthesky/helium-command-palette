import type { Worker } from "@playwright/test";
import { expect, isActive, pressShortcut, test, webUrl } from "./fixtures";

const OVERLAY = "#helium-command-palette";

async function tabUrls(worker: Worker): Promise<string[]> {
  return worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl ?? t.url ?? ""));
}

test.describe("typed addresses", () => {
  test("opens a typed address in a new tab", async ({ context, worker }) => {
    const page = await context.newPage();
    const startUrl = webUrl("Start page");
    await page.goto(startUrl);
    const target = webUrl("Typed-target");
    const typed = target.replace(/^http:\/\//, "");

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.type(typed);
    const first = overlay.locator(".row").first();
    await expect(first.locator(".badge")).toHaveText("URL");
    await expect(first.locator(".title")).toHaveText(typed);
    await expect(first.locator(".url")).toHaveText(target);
    await expect(overlay.locator(".row .badge").last()).toHaveText("Search");

    await page.keyboard.press("Enter");
    await expect.poll(() => tabUrls(worker)).toContain(target);
    expect(page.url()).toBe(startUrl);
  });

  test("switches to a tab that already has the typed address", async ({ context, worker }) => {
    const other = await context.newPage();
    await other.goto(webUrl("Already-open"));
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));
    const tabsBefore = (await tabUrls(worker)).length;

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.type(other.url().replace(/^http:\/\//, ""));
    await expect(overlay.locator(".row").first().locator(".badge")).toHaveText("Tab");
    await expect(overlay.locator(".row .badge")).not.toContainText(["URL"]);

    await page.keyboard.press("Enter");
    await expect.poll(() => isActive(worker, other.url())).toBe(true);
    expect(await tabUrls(worker)).toHaveLength(tabsBefore);
  });
});
