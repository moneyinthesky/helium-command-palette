import { describe, expect, it } from "vitest";
import { Quality } from "../../src/core/fuzzy";
import { withQueryRows } from "../../src/core/search";
import type { ScoredItem, TabItem } from "../../src/core/types";

function result(id: number, quality: Quality, isSource = false, url = `https://t${id}.com/`): ScoredItem {
  const item: TabItem = {
    kind: "tab",
    id: `tab:${id}`,
    tabId: id,
    windowId: 1,
    title: `Tab ${id}`,
    url,
    displayUrl: url.replace(/^https?:\/\//, ""),
    lastAccessed: 0,
    isSource,
    otherWindow: false,
    pinned: false,
    audible: false,
    muted: false,
  };
  return { item, score: 0, quality, titleMatches: [], urlMatches: [], folderMatches: [] };
}

const ids = (rows: ScoredItem[]) => rows.map((r) => r.item.id);

describe("withQueryRows: search row", () => {
  it("adds nothing when nothing is typed", () => {
    expect(withQueryRows([result(1, Quality.WordStart)], "  ")).toHaveLength(1);
  });

  it("is the only row when nothing matches", () => {
    const rows = withQueryRows([], " rust lifetimes ");
    expect(ids(rows)).toEqual(["search"]);
    expect(rows[0]!.item).toMatchObject({ kind: "search", query: "rust lifetimes" });
  });

  it("goes last when the best result matches at a word start", () => {
    expect(ids(withQueryRows([result(1, Quality.WordStart), result(2, Quality.InsideWord)], "x"))).toEqual([
      "tab:1",
      "tab:2",
      "search",
    ]);
  });

  it("goes first when the best result only matches inside a word or scattered", () => {
    expect(ids(withQueryRows([result(1, Quality.InsideWord)], "x"))).toEqual(["search", "tab:1"]);
    expect(ids(withQueryRows([result(1, Quality.Scattered)], "x"))).toEqual(["search", "tab:1"]);
  });

  it("goes first when the only good match is the tab you're on", () => {
    expect(ids(withQueryRows([result(1, Quality.WordStart, true)], "x"))).toEqual(["search", "tab:1"]);
  });

  it("keeps the list within the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => result(i, Quality.WordStart));
    const rows = withQueryRows(many, "x", 10);
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)!.item.id).toBe("search");
  });
});

describe("withQueryRows: address row", () => {
  it("goes first for an unmistakable address, with the search row last", () => {
    const rows = withQueryRows([result(1, Quality.WordStart)], "localhost:3000");
    expect(ids(rows)).toEqual(["url", "tab:1", "search"]);
    expect(rows[0]!.item).toMatchObject({ kind: "url", title: "localhost:3000", url: "http://localhost:3000/" });
  });

  it("is followed by the search row when nothing matches well", () => {
    expect(ids(withQueryRows([result(1, Quality.InsideWord)], "example.com"))).toEqual(["url", "search", "tab:1"]);
  });

  it("waits below good matches for a bare domain, which might be a search", () => {
    expect(ids(withQueryRows([result(1, Quality.WordStart)], "example.com"))).toEqual(["tab:1", "url", "search"]);
  });

  it("is replaced by a result that is already that page", () => {
    const open = result(2, Quality.InsideWord, false, "https://www.example.com/docs/?utm_source=x");
    expect(ids(withQueryRows([result(1, Quality.WordStart), open], "example.com/docs"))).toEqual([
      "tab:2",
      "tab:1",
      "search",
    ]);
  });

  it("isn't replaced by the tab you're already on", () => {
    const here = result(1, Quality.WordStart, true, "https://example.com/docs");
    expect(ids(withQueryRows([here], "example.com/docs"))).toEqual(["url", "search", "tab:1"]);
  });

  it("keeps the list within the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => result(i, Quality.WordStart));
    const rows = withQueryRows(many, "localhost", 10);
    expect(rows).toHaveLength(10);
    expect(rows[0]!.item.id).toBe("url");
    expect(rows.at(-1)!.item.id).toBe("search");
  });
});
