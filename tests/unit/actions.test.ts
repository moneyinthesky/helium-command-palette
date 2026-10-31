import { describe, expect, it } from "vitest";
import { actionForKey, actionsFor, filterActions, markdownLink, tabAfter } from "../../src/core/actions";
import { searchItem, urlItem } from "../../src/core/search";
import type { HistoryItem, TabItem } from "../../src/core/types";

const tab: TabItem = {
  kind: "tab",
  id: "tab:1",
  tabId: 1,
  windowId: 1,
  title: "Docs",
  url: "https://docs.rs/",
  displayUrl: "docs.rs",
  lastAccessed: 0,
  isSource: false,
  otherWindow: false,
  pinned: false,
  audible: false,
  muted: false,
};

const page: HistoryItem = {
  kind: "history",
  id: "history:1",
  title: "Page",
  url: "https://example.com/",
  displayUrl: "example.com",
  lastVisitTime: 0,
  visitCount: 1,
  typedCount: 0,
};

const ids = (item: Parameters<typeof actionsFor>[0]) => actionsFor(item).map((a) => a.id);

describe("actionsFor", () => {
  it("gives tabs tab actions, Enter switching to them and Copy link third", () => {
    expect(ids(tab)).toEqual([
      "open",
      "closeTab",
      "copyLink",
      "pin",
      "reload",
      "duplicate",
      "moveToWindow",
      "copyMarkdown",
    ]);
    expect(actionsFor(tab)[0]!.label).toBe("Switch to tab");
  });

  it("offers Mute only on a tab making sound, after Pin", () => {
    expect(ids({ ...tab, audible: true }).slice(3, 5)).toEqual(["pin", "mute"]);
    expect(ids(tab)).not.toContain("mute");
  });

  it("offers to undo what's already done to a tab, even once it's quiet", () => {
    const labels = actionsFor({ ...tab, pinned: true, muted: true }).map((a) => a.label);
    expect(labels).toContain("Unpin tab");
    expect(labels).toContain("Unmute tab");
    expect(labels).not.toContain("Pin tab");
    expect(labels).not.toContain("Mute tab");
  });

  it("gives pages and addresses open and copy actions", () => {
    const expected = ["open", "openHere", "openWindow", "copyLink", "copyMarkdown"];
    expect(ids(page)).toEqual(expected);
    expect(ids(urlItem("example.com", "https://example.com/"))).toEqual(expected);
  });

  it("gives the search row nothing to copy", () => {
    expect(ids(searchItem("rust"))).toEqual(["open", "openHere", "openWindow"]);
  });
});

describe("actionForKey", () => {
  it("finds the action bound to a key", () => {
    expect(actionForKey(actionsFor(page), { key: "Enter", mod: true })!.id).toBe("openHere");
    expect(actionForKey(actionsFor(tab), { key: "Backspace", mod: true })!.id).toBe("closeTab");
  });

  it("does what Enter does for ⌘Enter on a row without its own", () => {
    expect(actionForKey(actionsFor(tab), { key: "Enter", mod: true })!.id).toBe("open");
  });

  it("leaves other keys alone", () => {
    expect(actionForKey(actionsFor(tab), { key: "Backspace", mod: false })).toBeUndefined();
    expect(actionForKey(actionsFor(page), { key: "Backspace", mod: true })).toBeUndefined();
  });
});

describe("filterActions", () => {
  it("shows every action with nothing typed", () => {
    expect(filterActions(actionsFor(tab), "")).toHaveLength(8);
  });

  it("matches words of the label in any order, with highlights", () => {
    const shown = filterActions(actionsFor(tab), "link mark");
    expect(shown.map((s) => s.action.id)).toEqual(["copyMarkdown"]);
    expect(filterActions(actionsFor(tab), "pin")[0]).toEqual({
      action: expect.objectContaining({ id: "pin" }),
      matches: [0, 1, 2],
    });
  });

  it("ignores scattered letters", () => {
    expect(filterActions(actionsFor(tab), "pin").map((s) => s.action.id)).toEqual(["pin"]);
  });
});

describe("markdownLink", () => {
  it("escapes brackets in the title and parentheses in the URL", () => {
    expect(markdownLink("Arrays [MDN]", "https://en.wikipedia.org/wiki/Rust_(language)")).toBe(
      "[Arrays \\[MDN\\]](https://en.wikipedia.org/wiki/Rust_%28language%29)",
    );
  });
});

describe("tabAfter", () => {
  it("reflects what the action did", () => {
    expect(tabAfter(tab, "pin")).toMatchObject({ pinned: true });
    expect(tabAfter({ ...tab, pinned: true }, "unpin")).toMatchObject({ pinned: false });
    expect(tabAfter(tab, "mute")).toMatchObject({ muted: true });
    expect(tabAfter(tab, "reload")).toBe(tab);
    expect(tabAfter(tab, "closeTab")).toBeNull();
  });
});
