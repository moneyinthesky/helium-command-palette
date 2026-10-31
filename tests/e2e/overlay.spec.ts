import { expect, isActive, pageUrl, pressShortcut, test, webUrl } from "./fixtures";

const OVERLAY = "#helium-command-palette";

test.describe("overlay", () => {
  test("opens over the page and switches tabs", async ({ context, worker }) => {
    const other = await context.newPage();
    await other.goto(webUrl("Other page"));
    const page = await context.newPage();
    await page.goto(webUrl("Current page"));

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await expect(overlay.locator(".row .title").first()).toHaveText("Other page");
    await expect(overlay.locator(".row .title").last()).toHaveText("Current page");

    await page.keyboard.type("other");
    await page.keyboard.press("Enter");
    await expect(overlay).toHaveCount(0);
    await expect
      .poll(() => isActive(worker, other.url()))
      .toBe(true);
  });

  test("closes on Esc, click outside and the shortcut, and restores focus", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(webUrl("Focus page"));
    await page.locator("#page-input").focus();
    const overlay = page.locator(OVERLAY);

    await pressShortcut(worker, page);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
    await expect(page.locator("#page-input")).toBeFocused();

    await pressShortcut(worker, page);
    await expect(overlay.locator(".panel")).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(overlay).toHaveCount(0);

    await pressShortcut(worker, page);
    await expect(overlay.locator(".panel")).toBeVisible();
    await pressShortcut(worker, page);
    await expect(overlay).toHaveCount(0);
  });

  test("keeps typing away from the page's own key handlers", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(webUrl("Shortcut page"));
    await page.evaluate(() => {
      (window as unknown as { seen: string[] }).seen = [];
      document.addEventListener("keydown", (e) => (window as unknown as { seen: string[] }).seen.push(e.key));
    });

    await pressShortcut(worker, page);
    await expect(page.locator(OVERLAY).locator(".input")).toBeFocused();
    await page.keyboard.type("gh");
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
  });

  test("works on a page with a strict Content-Security-Policy", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(webUrl("Locked down", { csp: "default-src 'none'" }));

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    // Styles applied (rounded frame) and favicons loaded despite the policy.
    await expect(overlay.locator(".frame")).toHaveCSS("border-radius", "12px");
    const icon = overlay.locator(".row .icon").first();
    await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  });

  test("replaces an overlay left over from an earlier load of the extension", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(webUrl("Stale page"));
    // What a page looks like after the extension is rebuilt and reloaded while
    // it stays open: the previous load's overlay and its DOM are still there.
    await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url)!;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
          const old = document.createElement("div");
          old.id = "helium-command-palette";
          old.dataset.stale = "true";
          document.documentElement.append(old);
          Object.assign(globalThis, {
            __commandPalette: { loadId: "an earlier build", toggle: () => (document.title = "stale code ran") },
          });
        },
      });
    }, page.url());

    await pressShortcut(worker, page);
    await expect(page.locator(OVERLAY).locator(".input")).toBeFocused();
    await expect(page.locator("[data-stale]")).toHaveCount(0);
    await expect(page).toHaveTitle("Stale page");
  });

  test("falls back to a popup window on restricted pages", async ({ context, worker }) => {
    await (await context.newPage()).goto(pageUrl("Some tab"));
    const page = await context.newPage();
    await page.goto("chrome://version");

    const popupOpened = context.waitForEvent("page", (p) => p.url().includes("/palette.html"));
    await pressShortcut(worker, page);
    const popup = await popupOpened;
    await expect(popup.locator(".row .title").filter({ hasText: "Some tab" })).toHaveCount(1);
    const type = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: chrome.runtime.getURL("palette.html*") });
      return (await chrome.windows.get(tab!.windowId)).type;
    });
    expect(type).toBe("popup");

    // Pressing the shortcut again closes it.
    const closed = popup.waitForEvent("close");
    await pressShortcut(worker, page);
    await closed;
  });
});
