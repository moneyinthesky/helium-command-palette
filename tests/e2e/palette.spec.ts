import { expect, pageUrl, pressAndClose, test } from "./fixtures";

test.describe("palette (popup page)", () => {
  test("lists tabs from every window and switches to the chosen one", async ({ context, worker, extensionId }) => {
    const alpha = await context.newPage();
    await alpha.goto(pageUrl("Alpha page"));

    // A second window with two tabs; Charlie (the last one) ends up active.
    const second = await worker.evaluate(
      async (urls) => {
        const win = await chrome.windows.create({ url: urls });
        return { windowId: win!.id!, tabIds: win!.tabs!.map((t) => t.id!) };
      },
      [pageUrl("Bravo page"), pageUrl("Charlie page")],
    );
    const [bravoId] = second.tabIds;

    const alphaId = await worker.evaluate(async () => (await chrome.tabs.query({ title: "Alpha page" }))[0]!.id!);
    const palette = await context.newPage();
    await palette.goto(`chrome-extension://${extensionId}/palette.html?sourceTabId=${alphaId}`);

    const rows = palette.locator(".row .title");
    await expect(rows.filter({ hasText: "Bravo page" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Charlie page" })).toHaveCount(1);
    // The source tab is listed last.
    await expect(rows.last()).toHaveText("Alpha page");

    await palette.locator(".input").fill("brav");
    await expect(rows.first()).toHaveText("Bravo page");
    await expect(palette.locator(".row").first().locator("mark").first()).toHaveText("Brav");

    await pressAndClose(palette, "Enter");

    await expect
      .poll(() => worker.evaluate(async (id) => (await chrome.tabs.get(id)).active, bravoId!))
      .toBe(true);
  });

  test("keyboard moves the selection and Esc closes", async ({ context, extensionId }) => {
    for (const title of ["One", "Two", "Three"]) {
      await (await context.newPage()).goto(pageUrl(title));
    }
    const palette = await context.newPage();
    await palette.goto(`chrome-extension://${extensionId}/palette.html`);

    const selected = palette.locator('.row[aria-selected="true"]');
    await expect(palette.locator(".input")).toBeFocused();
    await expect(selected).toHaveCount(1);
    const first = await selected.locator(".title").textContent();

    await palette.keyboard.press("ArrowDown");
    await expect(selected.locator(".title")).not.toHaveText(first!);
    await palette.keyboard.press("Control+p");
    await expect(selected.locator(".title")).toHaveText(first!);

    // With no matches, the web search row is all that's left.
    await palette.locator(".input").fill("zzzz-no-match");
    await expect(palette.locator(".row .badge")).toHaveText(["Search"]);

    await pressAndClose(palette, "Escape");
  });
});
