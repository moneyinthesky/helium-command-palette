import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, pageUrl, pressAndClose, pressShortcut, test, webUrl } from "./fixtures";

const OVERLAY = "#helium-command-palette";

/** The palette as a page of its own, with two tabs open besides it. */
async function openPalette(context: BrowserContext, extensionId: string, { muteBravo = false } = {}): Promise<Page> {
  await (await context.newPage()).goto(pageUrl("Alpha page"));
  const bravoPage = await context.newPage();
  await bravoPage.goto(pageUrl("Bravo page"));
  if (muteBravo) {
    const worker = context.serviceWorkers()[0]!;
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ title: "Bravo page" });
      await chrome.tabs.update(tab!.id!, { muted: true });
    });
  }
  const palette = await context.newPage();
  await palette.goto(`chrome-extension://${extensionId}/palette.html`);
  return palette;
}

async function bravo(worker: Worker): Promise<chrome.tabs.Tab> {
  return worker.evaluate(async () => (await chrome.tabs.query({ title: "Bravo page" }))[0]!);
}

test.describe("actions menu", () => {
  test("opens with Tab or → and goes back with Esc or ←, keeping your text", async ({ context, extensionId }) => {
    const palette = await openPalette(context, extensionId);
    const input = palette.locator(".input");
    const crumb = palette.locator(".crumb");
    const titles = palette.locator(".row .title");
    await input.fill("bravo");
    await expect(titles.first()).toHaveText("Bravo page");
    await expect(palette.locator(".hints")).toContainText("⇥ Actions");

    await palette.keyboard.press("Tab");
    await expect(crumb).toBeVisible();
    await expect(crumb.locator(".crumb-title")).toHaveText("Bravo page");
    await expect(crumb.locator(".badge")).toHaveText("Tab");
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await expect(titles.first()).toHaveText("Switch to tab");
    await expect(palette.locator(".row").filter({ hasText: "Close tab" }).locator("kbd")).toHaveText(/^(⌘|Ctrl\+)⌫$/);
    await expect(palette.locator(".hints")).toContainText("esc Back");

    await palette.keyboard.type("pin");
    await expect(titles).toHaveText(["Pin tab"]);
    await palette.keyboard.press("Escape");
    await expect(crumb).toBeHidden();
    await expect(input).toHaveValue("bravo");
    await expect(palette.locator('.row[aria-selected="true"] .title')).toHaveText("Bravo page");

    await palette.keyboard.press("ArrowRight");
    await expect(crumb).toBeVisible();
    await palette.keyboard.press("ArrowLeft");
    await expect(crumb).toBeHidden();
    await expect(input).toHaveValue("bravo");

    await pressAndClose(palette, "Escape");
  });

  test("pins and unmutes a tab, keeping the palette open", async ({ context, worker, extensionId }) => {
    // Headless tabs can't play sound, so there's no Mute to test; start muted to test Unmute.
    const palette = await openPalette(context, extensionId, { muteBravo: true });
    const input = palette.locator(".input");
    const bravoRow = palette.locator(".row").filter({ has: palette.locator(".title", { hasText: "Bravo page" }) });
    await input.fill("bravo");
    await expect(bravoRow).toHaveCount(1);

    await palette.keyboard.press("Tab");
    await palette.keyboard.type("pin");
    await palette.keyboard.press("Enter");
    await expect.poll(async () => (await bravo(worker)).pinned).toBe(true);
    await expect(palette.locator(".crumb")).toBeHidden();
    await expect(input).toHaveValue("bravo");
    await expect(bravoRow.locator(".badge")).toHaveText("Pinned");

    await expect(bravoRow.locator('[aria-label="Muted"]')).toHaveCount(1);
    await palette.keyboard.press("Tab");
    await palette.keyboard.type("unmute");
    await palette.keyboard.press("Enter");
    await expect.poll(async () => (await bravo(worker)).mutedInfo?.muted).toBe(false);
    await expect(bravoRow.locator('[aria-label="Muted"]')).toHaveCount(0);

    // Now it's neither muted nor playing, so there's nothing to mute.
    await palette.keyboard.press("Tab");
    await expect(palette.locator(".row .title")).toContainText(["Unpin tab"]);
    await expect(palette.locator(".row .title").filter({ hasText: /mute/i })).toHaveCount(0);
  });

  test("moves a tab to a new window", async ({ context, worker, extensionId }) => {
    const palette = await openPalette(context, extensionId);
    const before = await bravo(worker);
    await palette.locator(".input").fill("bravo");
    await expect(palette.locator(".row .title").first()).toHaveText("Bravo page");
    await palette.keyboard.press("Tab");
    await palette.keyboard.type("move");
    await pressAndClose(palette, "Enter");

    await expect.poll(async () => (await bravo(worker)).windowId).not.toBe(before.windowId);
    const tabsInWindow = await worker.evaluate(async (id) => (await chrome.tabs.query({ windowId: id })).length, (await bravo(worker)).windowId);
    expect(tabsInWindow).toBe(1);
  });

  test("duplicates a tab", async ({ context, worker, extensionId }) => {
    const palette = await openPalette(context, extensionId);
    await palette.locator(".input").fill("bravo");
    await expect(palette.locator(".row .title").first()).toHaveText("Bravo page");
    await palette.keyboard.press("Tab");
    await palette.keyboard.type("duplicate");
    await pressAndClose(palette, "Enter");

    const url = pageUrl("Bravo page");
    await expect.poll(() => worker.evaluate(async (u) => (await chrome.tabs.query({ url: u })).length, url)).toBe(2);
  });

  test("opens an address in a new window", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));
    const target = webUrl("Window-target");

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.type(target.replace(/^http:\/\//, ""));
    await expect(overlay.locator(".row .badge").first()).toHaveText("URL");
    await page.keyboard.press("Tab");
    await page.keyboard.type("window");
    await expect(overlay.locator(".row .title")).toHaveText(["Open in new window"]);
    await page.keyboard.press("Enter");
    await expect(overlay).toHaveCount(0);

    await expect
      .poll(() =>
        worker.evaluate(async (u) => {
          const windows = await chrome.windows.getAll({ populate: true });
          return windows.some((w) => w.tabs?.length === 1 && w.tabs[0]!.url === u);
        }, target),
      )
      .toBe(true);
    expect(page.url()).toBe(webUrl("Start page"));
  });

  test("copies a link, and a Markdown link, from the overlay", async ({ context, worker }) => {
    await (await context.newPage()).goto(webUrl("Copy me"));
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    const overlay = page.locator(OVERLAY);

    for (const [action, expected] of [
      ["copy link", webUrl("Copy me")],
      ["markdown", `[Copy me](${webUrl("Copy me")})`],
    ] as const) {
      await pressShortcut(worker, page);
      await expect(overlay.locator(".input")).toBeFocused();
      await page.keyboard.type("copy me");
      await expect(overlay.locator(".row .title").first()).toHaveText("Copy me");
      await page.keyboard.press("Tab");
      await page.keyboard.type(action);
      await page.keyboard.press("Enter");
      await expect(overlay).toHaveCount(0);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    }
  });

  test("copies a link from the separate window", async ({ context, extensionId }) => {
    const palette = await openPalette(context, extensionId);
    const reader = await context.newPage();
    await reader.goto(webUrl("Reader"));
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(reader.url()).origin });
    await palette.bringToFront();

    await palette.locator(".input").fill("bravo");
    await expect(palette.locator(".row .title").first()).toHaveText("Bravo page");
    await palette.keyboard.press("Tab");
    await palette.keyboard.type("copy link");
    await pressAndClose(palette, "Enter");

    await reader.bringToFront();
    expect(await reader.evaluate(() => navigator.clipboard.readText())).toBe(pageUrl("Bravo page"));
  });
});
