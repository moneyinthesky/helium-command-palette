import { describe, expect, it } from "vitest";
import { Quality } from "../../src/core/fuzzy";
import { withSearchRow } from "../../src/core/search";
import type { ScoredItem, TabItem } from "../../src/core/types";

function result(id: number, quality: Quality, isSource = false): ScoredItem {
  const item: TabItem = {
    kind: "tab",
    id: `tab:${id}`,
    tabId: id,
    windowId: 1,
    title: `Tab ${id}`,
    url: `https://t${id}.com`,
    displayUrl: `t${id}.com`,
    lastAccessed: 0,
    isSource,
  };
  return { item, score: 0, quality, titleMatches: [], urlMatches: [], folderMatches: [] };
}

const ids = (rows: ScoredItem[]) => rows.map((r) => r.item.id);

describe("withSearchRow", () => {
  it("adds nothing when nothing is typed", () => {
    expect(withSearchRow([result(1, Quality.WordStart)], "  ")).toHaveLength(1);
  });

  it("is the only row when nothing matches", () => {
    const rows = withSearchRow([], " rust lifetimes ");
    expect(ids(rows)).toEqual(["search"]);
    expect(rows[0]!.item).toMatchObject({ kind: "search", query: "rust lifetimes" });
  });

  it("goes last when the best result matches at a word start", () => {
    expect(ids(withSearchRow([result(1, Quality.WordStart), result(2, Quality.InsideWord)], "x"))).toEqual([
      "tab:1",
      "tab:2",
      "search",
    ]);
  });

  it("goes first when the best result only matches inside a word or scattered", () => {
    expect(ids(withSearchRow([result(1, Quality.InsideWord)], "x"))).toEqual(["search", "tab:1"]);
    expect(ids(withSearchRow([result(1, Quality.Scattered)], "x"))).toEqual(["search", "tab:1"]);
  });

  it("goes first when the only good match is the tab you're on", () => {
    expect(ids(withSearchRow([result(1, Quality.WordStart, true)], "x"))).toEqual(["search", "tab:1"]);
  });

  it("keeps the list within the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => result(i, Quality.WordStart));
    const rows = withSearchRow(many, "x", 10);
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)!.item.id).toBe("search");
  });
});
