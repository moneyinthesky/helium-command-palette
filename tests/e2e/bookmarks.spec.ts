import type { Worker } from "@playwright/test";
import { expect, pressShortcut, test, webUrl } from "./fixtures";

const OVERLAY = "#helium-command-palette";

/** Bookmarks `url` in the folder `folder` on the bookmarks bar. */
async function addBookmark(worker: Worker, title: string, url: string, folder: string): Promise<void> {
  await worker.evaluate(
    async ({ title, url, folder }) => {
      const [root] = await chrome.bookmarks.getTree();
      const bar = root!.children![0]!;
      const parent = await chrome.bookmarks.create({ parentId: bar.id, title: folder });
      await chrome.bookmarks.create({ parentId: parent.id, title, url });
    },
    { title, url, folder },
  );
}

test.describe("bookmarks", () => {
  test("finds a bookmark by its folder and opens it in a new tab with Enter", async ({ context, worker }) => {
    const lasagneUrl = webUrl("Lasagne");
    await addBookmark(worker, "Lasagne", lasagneUrl, "Recipes");
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".input")).toBeFocused();
    await page.keyboard.type("recipes");
    const row = overlay.locator(".row").first();
    await expect(row.locator(".title")).toHaveText("Lasagne");
    await expect(row.locator(".badge")).toHaveText("Bookmark");
    await expect(row.locator(".folder")).toHaveText("Recipes");

    const opened = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    await expect(await opened).toHaveURL(lasagneUrl);
  });

  test("only shows once you type, and hides the page's history entry", async ({ context, worker }) => {
    const visited = await context.newPage();
    await visited.goto(webUrl("Rust docs"));
    await visited.close();
    await addBookmark(worker, "My Rust bookmark", webUrl("Rust docs"), "Work");
    await addBookmark(worker, "Never visited", webUrl("Never visited"), "Work");
    const page = await context.newPage();
    await page.goto(webUrl("Start page"));

    await pressShortcut(worker, page);
    const overlay = page.locator(OVERLAY);
    await expect(overlay.locator(".row").filter({ hasText: "Start page" })).toHaveCount(1);
    // Give bookmarks and history time to arrive, then check neither is listed.
    await page.waitForTimeout(200);
    await expect(overlay.locator(".row").filter({ hasText: /My Rust bookmark|Rust docs|Never visited/ })).toHaveCount(0);

    await page.keyboard.type("rust");
    const rows = overlay.locator(".row").filter({ hasNotText: "Search the web" });
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".badge")).toHaveText("Bookmark");
  });
});
