import { describe, expect, it } from "vitest";
import { rank } from "../../src/core/rank";
import type { TabItem } from "../../src/core/types";
import { toDisplayUrl } from "../../src/core/url";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

function tab(id: number, title: string, url: string, ageHours: number, isSource = false): TabItem {
  return {
    kind: "tab",
    id: `tab:${id}`,
    tabId: id,
    windowId: 1,
    title,
    url,
    displayUrl: toDisplayUrl(url),
    lastAccessed: NOW - ageHours * HOUR,
    isSource,
  };
}

const ids = (items: ReturnType<typeof rank>) => items.map((r) => r.item.id);

describe("rank", () => {
  it("lists most recent first with an empty query, source tab last", () => {
    const items = [tab(1, "A", "https://a.com", 3), tab(2, "B", "https://b.com", 0, true), tab(3, "C", "https://c.com", 1)];
    expect(ids(rank(items, "", { now: NOW }))).toEqual(["tab:3", "tab:1", "tab:2"]);
  });

  it("ranks a better match above a more recent weaker one", () => {
    const items = [tab(1, "My docs", "https://x.com/notes", 0), tab(2, "Docs", "https://docs.rs", 48)];
    expect(ids(rank(items, "docs", { now: NOW }))[0]).toBe("tab:2");
  });

  it("breaks ties between equal matches by recency", () => {
    const items = [tab(1, "Inbox", "https://mail.a.com", 10), tab(2, "Inbox", "https://mail.b.com", 1)];
    expect(ids(rank(items, "inbox", { now: NOW }))).toEqual(["tab:2", "tab:1"]);
  });

  it("puts the source tab last even when it matches best", () => {
    const items = [tab(1, "GitHub", "https://github.com", 0, true), tab(2, "My GitHub notes", "https://notes.app", 5)];
    expect(ids(rank(items, "github", { now: NOW }))).toEqual(["tab:2", "tab:1"]);
  });

  it("caps results", () => {
    const items = Array.from({ length: 30 }, (_, i) => tab(i, `Tab ${i}`, `https://t${i}.com`, i));
    expect(rank(items, "tab", { now: NOW, limit: 10 })).toHaveLength(10);
  });
});

describe("toDisplayUrl", () => {
  it("strips scheme, www and trailing slash", () => {
    expect(toDisplayUrl("https://www.example.com/path/")).toBe("example.com/path");
    expect(toDisplayUrl("chrome://extensions/")).toBe("extensions");
  });
});
