import { describe, expect, it } from "vitest";
import { rank } from "../../src/core/rank";
import type { BookmarkItem, HistoryItem, TabItem } from "../../src/core/types";
import { isOpenable, toDisplayUrl } from "../../src/core/url";

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

function visit(url: string, title: string, ageHours: number, visitCount = 1, typedCount = 0): HistoryItem {
  return {
    kind: "history",
    id: `history:${url}`,
    title,
    url,
    displayUrl: toDisplayUrl(url),
    lastVisitTime: NOW - ageHours * HOUR,
    visitCount,
    typedCount,
  };
}

function bookmark(url: string, title: string, folder = "", visitAgeHours?: number, visitCount = 0): BookmarkItem {
  return {
    kind: "bookmark",
    id: `bookmark:${url}`,
    title,
    url,
    displayUrl: toDisplayUrl(url),
    folder,
    dateAdded: NOW - 1000 * HOUR,
    lastVisitTime: visitAgeHours === undefined ? 0 : NOW - visitAgeHours * HOUR,
    visitCount,
    typedCount: 0,
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

  it("lists only tabs with an empty query, source tab last", () => {
    const items = [
      visit("https://old.com", "Old", 50),
      tab(1, "Source", "https://s.com", 0, true),
      bookmark("https://seen.com", "Visited", "", 1),
      visit("https://new.com", "New", 1),
      tab(2, "Other", "https://o.com", 2),
    ];
    expect(ids(rank(items, "", { now: NOW }))).toEqual(["tab:2", "tab:1"]);
    expect(ids(rank(items, "  ", { now: NOW }))).toEqual(["tab:2", "tab:1"]);
  });

  describe("word starts beat matches inside words; tabs win within each", () => {
    const amazon = visit("https://www.amazon.co.uk/", "Amazon.co.uk: Low Prices in Electronics, Books", 72);
    const vivek = tab(1, "What Vivek Ramaswamy Doesn't Want You to Know - YouTube", "https://www.youtube.com/watch?v=x", 0);

    it('"ama" finds Amazon in history before a tab with it inside "Ramaswamy"', () => {
      expect(ids(rank([vivek, amazon], "ama", { now: NOW }))).toEqual(["history:https://www.amazon.co.uk/", "tab:1"]);
    });

    it('"rama" is a word start in "Vivek Ramaswamy", so the tab leads', () => {
      const ramada = visit("https://ramada.com", "Ramada Hotels", 1, 50, 5);
      expect(ids(rank([ramada, vivek], "rama", { now: NOW }))).toEqual(["tab:1", "history:https://ramada.com"]);
    });

    it("counts the start of a URL segment as a word start", () => {
      const shop = visit("https://www.amazon.co.uk/gp/cart", "Shopping Basket", 72);
      expect(ids(rank([vivek, shop], "ama", { now: NOW }))[0]).toBe("history:https://www.amazon.co.uk/gp/cart");
    });

    it("puts a tab above history when both match equally well", () => {
      const items = [visit("https://a.com", "Rust book", 0, 500, 100), tab(2, "Rust docs", "https://b.com", 48)];
      expect(ids(rank(items, "rust", { now: NOW }))).toEqual(["tab:2", "history:https://a.com"]);
    });

    it("ranks scattered letters below any word match", () => {
      const items = [tab(1, "Yearly outlook update", "https://b.com", 0), visit("https://y.com", "Your stuff", 48)];
      expect(ids(rank(items, "you", { now: NOW }))).toEqual(["history:https://y.com", "tab:1"]);
    });

    it("grades a multi-word query by its weakest word", () => {
      // Both words start words in "Amazon Video"; the tab has "ama" inside a word and "vid" scattered.
      const items = [vivek, visit("https://amazon.com/video", "Amazon Video", 72)];
      expect(ids(rank(items, "ama vid", { now: NOW }))).toEqual(["history:https://amazon.com/video", "tab:1"]);
      expect(ids(rank(items, "vivek ama", { now: NOW }))).toEqual(["tab:1"]);
    });
  });

  it("still puts the source tab below history", () => {
    const items = [tab(1, "YouTube", "https://youtube.com", 0, true), visit("https://y.com", "Your stuff", 48)];
    expect(ids(rank(items, "you", { now: NOW }))).toEqual(["history:https://y.com", "tab:1"]);
  });

  it("prefers history visited often or typed by hand", () => {
    const items = [
      visit("https://once.com/news", "News", 1, 1, 0),
      visit("https://often.com/news", "News", 1, 40, 0),
      visit("https://typed.com/news", "News", 1, 40, 10),
    ];
    expect(ids(rank(items, "news", { now: NOW }))).toEqual([
      "history:https://typed.com/news",
      "history:https://often.com/news",
      "history:https://once.com/news",
    ]);
  });

  describe("bookmarks", () => {
    it("rank between tabs and history when they match equally well", () => {
      const items = [
        visit("https://h.com", "Rust history", 0, 500, 100),
        bookmark("https://b.com", "Rust bookmark"),
        tab(1, "Rust tab", "https://t.com", 48),
      ];
      expect(ids(rank(items, "rust", { now: NOW }))).toEqual(["tab:1", "bookmark:https://b.com", "history:https://h.com"]);
    });

    it("still lose to a better match from history", () => {
      const items = [bookmark("https://b.com", "Trust fund"), visit("https://h.com", "Rust", 48)];
      expect(ids(rank(items, "rust", { now: NOW }))).toEqual(["history:https://h.com", "bookmark:https://b.com"]);
    });

    it("are found by folder name", () => {
      const items = [bookmark("https://food.com/lasagne", "Lasagne", "Home / Recipes"), bookmark("https://x.com", "Other")];
      const [hit, ...rest] = rank(items, "recipes", { now: NOW });
      expect(hit!.item.id).toBe("bookmark:https://food.com/lasagne");
      expect(hit!.folderMatches).toEqual([7, 8, 9, 10, 11, 12, 13]);
      expect(rest).toEqual([]);
    });

    it("prefer ones you visit", () => {
      const items = [bookmark("https://a.com/news", "News"), bookmark("https://b.com/news", "News", "", 1, 40)];
      expect(ids(rank(items, "news", { now: NOW }))).toEqual(["bookmark:https://b.com/news", "bookmark:https://a.com/news"]);
    });
  });

  it("caps results", () => {
    const items = Array.from({ length: 30 }, (_, i) => tab(i, `Tab ${i}`, `https://t${i}.com`, i));
    expect(rank(items, "tab", { now: NOW, limit: 10 })).toHaveLength(10);
  });
});

describe("url helpers", () => {
  it("allows only pages the palette should open", () => {
    expect(isOpenable("https://example.com")).toBe(true);
    expect(isOpenable("chrome://settings")).toBe(true);
    expect(isOpenable("javascript:alert(1)")).toBe(false);
    expect(isOpenable("data:text/html,hi")).toBe(false);
    expect(isOpenable("not a url")).toBe(false);
  });
});

describe("toDisplayUrl", () => {
  it("strips scheme, www and trailing slash", () => {
    expect(toDisplayUrl("https://www.example.com/path/")).toBe("example.com/path");
    expect(toDisplayUrl("chrome://extensions/")).toBe("extensions");
  });
});
