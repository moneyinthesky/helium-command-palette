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

  test("shows the keys for the highlighted row", async ({ context, extensionId }) => {
    await (await context.newPage()).goto(pageUrl("Some tab"));
    const palette = await context.newPage();
    await palette.goto(`chrome-extension://${extensionId}/palette.html`);
    const hints = palette.locator(".hints");

    await expect(hints).toContainText("Switch to tab");
    await palette.locator(".input").fill("zzzz-no-match");
    await expect(hints).toContainText("Search in new tab");
    await expect(hints).toContainText(/(⌘|Ctrl\+)↵ Search here/);
    await expect(hints).toContainText("esc Close");
  });

  test("Cmd/Ctrl+Backspace closes the highlighted tab and keeps the palette open", async ({ context, worker, extensionId }) => {
    await (await context.newPage()).goto(pageUrl("Keep me"));
    await (await context.newPage()).goto(pageUrl("Close me"));
    const palette = await context.newPage();
    await palette.goto(`chrome-extension://${extensionId}/palette.html`);
    const input = palette.locator(".input");
    const titles = palette.locator(".row .title");
    const countTabs = () => worker.evaluate(async () => (await chrome.tabs.query({})).length);

    await input.fill("close me");
    await expect(titles.first()).toHaveText("Close me");
    await expect(palette.locator(".hints")).toContainText(/(⌘|Ctrl\+)⌫ Close tab/);
    const tabsBefore = await countTabs();

    await palette.keyboard.press("ControlOrMeta+Backspace");
    await expect.poll(countTabs).toBe(tabsBefore - 1);
    // Its history entry may come back in its place, but not as a tab.
    await expect(palette.locator('.row[data-kind="tab"] .title').filter({ hasText: "Close me" })).toHaveCount(0);
    expect(await worker.evaluate(async () => (await chrome.tabs.query({ title: "Keep me" })).length)).toBe(1);
    await expect(input).toHaveValue("close me");
    await expect(palette.locator('.row[aria-selected="true"]')).toHaveCount(1);

    // On any other row the key edits the text as usual.
    await input.fill("zzzz-no-match");
    await expect(palette.locator(".row .badge")).toHaveText(["Search"]);
    await palette.keyboard.press("ControlOrMeta+Backspace");
    await expect(input).not.toHaveValue("zzzz-no-match");
    expect(await countTabs()).toBe(tabsBefore - 1);
  });

  test("shows pinned, sound, group and window details on tab rows", async ({ context, worker, extensionId }) => {
    const alpha = await context.newPage();
    await alpha.goto(pageUrl("Alpha page"));
    const titles = ["Pinned page", "Muted page", "Grouped page", "Far page"];
    const urls = Object.fromEntries(titles.map((t) => [t, pageUrl(t)]));
    const alphaId = await worker.evaluate(async (urls) => {
      const [alpha] = await chrome.tabs.query({ title: "Alpha page" });
      const windowId = alpha!.windowId;
      const open = (url: string, props: chrome.tabs.CreateProperties = {}) =>
        chrome.tabs.create({ windowId, url, active: false, ...props });
      await open(urls["Pinned page"]!, { pinned: true });
      const muted = await open(urls["Muted page"]!);
      await chrome.tabs.update(muted.id!, { muted: true });
      const grouped = await open(urls["Grouped page"]!);
      const groupId = await chrome.tabs.group({ tabIds: grouped.id!, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: "Research", color: "blue" });
      await chrome.windows.create({ url: urls["Far page"]! });
      return alpha!.id!;
    }, urls);
    // Rows show whatever title a tab has when the palette opens.
    await expect
      .poll(() => worker.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.title)))
      .toEqual(expect.arrayContaining(titles));

    const palette = await context.newPage();
    await palette.goto(`chrome-extension://${extensionId}/palette.html?sourceTabId=${alphaId}`);
    const row = (title: string) => palette.locator(".row").filter({ has: palette.locator(".title", { hasText: title }) });

    await expect(row("Pinned page").locator('[aria-label="Pinned"]')).toHaveCount(1);
    await expect(row("Muted page").locator('[aria-label="Muted"]')).toHaveCount(1);
    await expect(row("Alpha page").locator(".state")).toHaveCount(0);
    await expect(row("Grouped page").locator(".group")).toHaveText("Research");
    await expect(row("Grouped page").locator(".group")).toHaveAttribute("data-color", "blue");
    await expect(row("Far page").locator(".where")).toHaveText("Other window");
    await expect(row("Grouped page").locator(".where")).toHaveCount(0);

    await palette.locator(".input").fill("research");
    await expect(palette.locator(".row .title").first()).toHaveText("Grouped page");
    await expect(palette.locator(".row").first().locator(".group mark")).toHaveText("Research");
  });
});
