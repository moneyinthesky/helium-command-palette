import type { BrowserContext } from "@playwright/test";
import { expect, pressAndClose, pressShortcut, test, webUrl } from "./fixtures";

const OVERLAY = "#helium-command-palette";

/** Visits a page (so it lands in history with its title), then closes the tab. */
async function visitAndClose(context: BrowserContext, title: string): Promise<string> {
  const page = await context.newPage();
  await page.goto(webUrl(title));
  await page.close();
  return webUrl(title);
}

test.describe("history", () => {
  test("finds a closed page and opens it in a new tab next to the current one with Enter", async ({ context, worker }) => {
    const rustUrl = await visitAndClose(context, "Rust docs");
    const page = await context.newPage();
    const startUrl = webUrl("Start page");
    await page.goto(startUrl);

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.type("rust");
    const row = overlay.locator(".row").first();
    await expect(row.locator(".title")).toHaveText("Rust docs");
    await expect(row.locator(".badge")).toHaveText("History");

    const opened = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    const newPage = await opened;
    await expect(newPage).toHaveURL(rustUrl);
    expect(page.url()).toBe(startUrl);

    const indexOf = (url: string) =>
      worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)!.index, url);
    expect(await indexOf(rustUrl)).toBe((await indexOf(startUrl)) + 1);
  });

  test("replaces the current page with Cmd/Ctrl+Enter", async ({ context, worker }) => {
    const rustUrl = await visitAndClose(context, "Rust docs");
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));

    await pressShortcut(worker, page);
    await expect(page.locator(OVERLAY).locator(".input")).toBeFocused();
    await page.keyboard.type("rust");
    await expect(page.locator(OVERLAY).locator(".row .title").first()).toHaveText("Rust docs");

    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page).toHaveURL(rustUrl);
  });

  test("reuses an empty new tab instead of opening another", async ({ context, worker }) => {
    const rustUrl = await visitAndClose(context, "Rust docs");

    // The new-tab page is restricted, so the palette opens in its popup window.
    const popupOpened = context.waitForEvent("page", (p) => p.url().includes("/palette.html"));
    const ntpId = await worker.evaluate(async (warmUpUrl) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const loaded = async (id: number) => {
        while ((await chrome.tabs.get(id)).status !== "complete") await sleep(50);
      };
      // In a brand-new profile the first navigation away from a new-tab page is
      // dropped, palette or not. Use one up first so the test sees normal behaviour.
      const warmUp = await chrome.tabs.create({});
      await loaded(warmUp.id!);
      await chrome.tabs.update(warmUp.id!, { url: warmUpUrl });
      await sleep(500);
      await chrome.tabs.remove(warmUp.id!);

      const tab = await chrome.tabs.create({});
      await loaded(tab.id!);
      const hook = (globalThis as unknown as { __test: { togglePalette(t?: chrome.tabs.Tab): Promise<void> } }).__test;
      await hook.togglePalette(await chrome.tabs.get(tab.id!));
      return tab.id!;
    }, webUrl("Warm-up"));
    const popup = await popupOpened;
    await popup.locator(".input").fill("rust");
    await expect(popup.locator(".row .title").first()).toHaveText("Rust docs");
    const tabCount = () => worker.evaluate(async () => (await chrome.tabs.query({ windowType: "normal" })).length);
    const before = await tabCount();

    await pressAndClose(popup, "Enter");
    await expect.poll(() => worker.evaluate(async (id) => (await chrome.tabs.get(id)).url, ntpId)).toBe(rustUrl);
    expect(await tabCount()).toBe(before);
  });

  test("shows a page that's open in a tab only once, as the tab", async ({ context, worker }) => {
    const open = await context.newPage();
    await open.goto(webUrl("Open and visited"));
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));

    await pressShortcut(worker, page);
    await expect(page.locator(OVERLAY).locator(".input")).toBeFocused();
    await page.keyboard.type("open and visited");
    const rows = page.locator(OVERLAY).locator(".row");
    // Give history time to arrive, then check it didn't add a duplicate.
    await expect.poll(() => worker.evaluate(() => chrome.history.search({ text: "Open and visited" }).then((r) => r.length))).toBe(1);
    await page.waitForTimeout(200);
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".badge")).toHaveText("Tab");
  });

  test("shows history quieter than tabs until you type", async ({ context, worker }) => {
    await visitAndClose(context, "Rust docs");
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));
    await (await context.newPage()).goto(webUrl("Other tab"));
    await page.bringToFront();

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    const rustRow = overlay.locator(".row").filter({ hasText: "Rust docs" });
    const tabRow = overlay.locator(".row").filter({ hasText: "Other tab" });
    await expect(rustRow).toHaveClass(/\bdim\b/);
    await expect(tabRow).not.toHaveClass(/\bdim\b/);

    await page.keyboard.type("rust");
    await expect(rustRow).toHaveCount(1);
    await expect(rustRow).not.toHaveClass(/\bdim\b/);
  });
});
