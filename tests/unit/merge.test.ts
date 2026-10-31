import { describe, expect, it } from "vitest";
import { dedupeHistory, mergeItems } from "../../src/core/merge";
import type { BookmarkItem, HistoryItem, TabItem } from "../../src/core/types";
import { pageKey } from "../../src/core/url";

const tab = (url: string): TabItem => ({
  kind: "tab",
  id: `tab:${url}`,
  tabId: 1,
  windowId: 1,
  title: url,
  url,
  displayUrl: url,
  lastAccessed: 0,
  isSource: false,
  otherWindow: false,
  pinned: false,
  audible: false,
  muted: false,
});

const visit = (url: string, lastVisitTime = 0, visitCount = 1, typedCount = 0, title = url): HistoryItem => ({
  kind: "history",
  id: `history:${url}`,
  title,
  url,
  displayUrl: url,
  lastVisitTime,
  visitCount,
  typedCount,
});

const bookmark = (url: string, folder = ""): BookmarkItem => ({
  kind: "bookmark",
  id: `bookmark:${url}:${folder}`,
  title: url,
  url,
  displayUrl: url,
  folder,
  dateAdded: 0,
  lastVisitTime: 0,
  visitCount: 0,
  typedCount: 0,
});

describe("mergeItems", () => {
  it("drops history for pages open in a tab, ignoring the #fragment", () => {
    const merged = mergeItems([
      [tab("https://a.com/doc#intro")],
      [visit("https://a.com/doc"), visit("https://a.com/doc#usage"), visit("https://b.com")],
    ]);
    expect(merged.map((i) => i.id)).toEqual(["tab:https://a.com/doc#intro", "history:https://b.com"]);
  });

  it("treats a tab and history entry differing only in tracking parameters as the same page", () => {
    const merged = mergeItems([[tab("https://a.com/post?utm_source=feed")], [visit("https://a.com/post")]]);
    expect(merged.map((i) => i.kind)).toEqual(["tab"]);
  });

  it("hides history matching an open tab's path and title", () => {
    const t = { ...tab("https://shop.com/?session=1"), title: "Shop" };
    const merged = mergeItems([[t], [visit("https://shop.com/?session=2", 0, 1, 0, "Shop")]]);
    expect(merged.map((i) => i.kind)).toEqual(["tab"]);
  });

  it("shows a bookmarked page once, as the bookmark, with its history's visits", () => {
    const merged = mergeItems([
      [bookmark("https://a.com/doc")],
      [visit("https://a.com/doc#usage", 500, 7, 2), visit("https://b.com")],
    ]);
    expect(merged.map((i) => i.id)).toEqual(["bookmark:https://a.com/doc:", "history:https://b.com"]);
    expect(merged[0]).toMatchObject({ lastVisitTime: 500, visitCount: 7, typedCount: 2 });
  });

  it("gives the visits to every bookmark of the page", () => {
    const merged = mergeItems([
      [bookmark("https://a.com", "Work"), bookmark("https://a.com", "Home")],
      [visit("https://a.com", 1, 3)],
    ]);
    expect(merged.map((i) => (i.kind === "bookmark" ? i.visitCount : -1))).toEqual([3, 3]);
  });

  it("hides a bookmark for a page that's open in a tab", () => {
    const merged = mergeItems([[tab("https://a.com/doc")], [bookmark("https://a.com/doc")], [visit("https://a.com/doc")]]);
    expect(merged.map((i) => i.kind)).toEqual(["tab"]);
  });

  it("doesn't change the bookmarks it was given", () => {
    const b = bookmark("https://a.com");
    mergeItems([[b], [visit("https://a.com", 1, 3)]]);
    expect(b.visitCount).toBe(0);
  });

  it("works whichever source arrives first", () => {
    expect(mergeItems([[visit("https://a.com")]]).map((i) => i.id)).toEqual(["history:https://a.com"]);
    expect(mergeItems([[visit("https://a.com")], [tab("https://a.com")]]).map((i) => i.id)).toEqual(["tab:https://a.com"]);
    expect(mergeItems([[visit("https://a.com")], [bookmark("https://a.com")]]).map((i) => i.kind)).toEqual(["bookmark"]);
  });
});

describe("pageKey", () => {
  const same = (a: string, b: string) => expect(pageKey(a)).toBe(pageKey(b));
  const different = (a: string, b: string) => expect(pageKey(a)).not.toBe(pageKey(b));

  it("ignores fragments, tracking parameters, www, trailing slashes and parameter order", () => {
    same("https://a.com/doc#intro", "https://a.com/doc");
    same("https://a.com/doc?utm_source=x&utm_medium=y&fbclid=z", "https://a.com/doc");
    same("https://www.a.com/doc/", "https://a.com/doc");
    same("https://a.com/s?b=2&a=1", "https://a.com/s?a=1&b=2");
    same("https://a.com/", "https://a.com");
  });

  it("ignores referral parameters and Amazon's tracking", () => {
    same("https://www.amazon.co.uk/?ref_=nav_signin", "https://www.amazon.co.uk/");
    same("https://blog.example.com/post?ref=producthunt", "https://blog.example.com/post");
    same(
      "https://www.amazon.com/dp/B0ABC?pd_rd_w=x&pf_rd_p=y&psc=1&qid=123&sr=8-1",
      "https://www.amazon.com/dp/B0ABC",
    );
    different("https://www.amazon.com/dp/B0ABC", "https://www.amazon.com/dp/B0DEF");
  });

  it("ignores YouTube timestamps and share ids, but not the video", () => {
    same("https://www.youtube.com/watch?v=abc&t=642s", "https://www.youtube.com/watch?v=abc");
    same("https://youtube.com/watch?v=abc&si=xyz", "https://www.youtube.com/watch?v=abc");
    different("https://www.youtube.com/watch?v=abc", "https://www.youtube.com/watch?v=def");
  });

  it("keeps parameters that pick the page", () => {
    different("https://google.com/search?q=rust", "https://google.com/search?q=go");
    different("https://a.com/item?id=1", "https://a.com/item?id=2");
    // "t" only means a timestamp on YouTube.
    different("https://a.com/page?t=1", "https://a.com/page?t=2");
  });

  it("keeps scheme and port", () => {
    different("http://a.com/x", "https://a.com/x");
    different("http://localhost:3000/", "http://localhost:4000/");
  });
});

describe("dedupeHistory", () => {
  it("collapses entries with the same path and title, whatever unknown parameters they carry", () => {
    const title = "Amazon.co.uk: Low Prices in Electronics, Books, Sports Equipment & more";
    const out = dedupeHistory([
      visit("https://www.amazon.co.uk/", 100, 1, 0, title),
      visit("https://www.amazon.co.uk/?campaign_tracker=abc", 200, 1, 0, title),
    ]);
    expect(out.map((i) => i.url)).toEqual(["https://www.amazon.co.uk/?campaign_tracker=abc"]);
  });

  it("keeps same-path pages whose titles differ", () => {
    const out = dedupeHistory([
      visit("https://www.google.com/search?q=rust", 100, 1, 0, "rust - Google Search"),
      visit("https://www.google.com/search?q=go", 200, 1, 0, "go - Google Search"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("doesn't use a title that is just the URL", () => {
    const out = dedupeHistory([visit("https://a.com/x?id=1", 1), visit("https://a.com/x?id=2", 2)]);
    expect(out).toHaveLength(2);
  });

  it("keeps the most recent URL for a page and adds up its visits", () => {
    const out = dedupeHistory([
      visit("https://www.youtube.com/watch?v=abc", 100, 3, 1),
      visit("https://www.youtube.com/watch?v=abc&t=642s", 200, 2, 0),
      visit("https://www.youtube.com/watch?v=def", 150, 1, 0),
    ]);
    expect(out).toHaveLength(2);
    const abc = out.find((i) => i.url.includes("abc"))!;
    expect(abc.url).toBe("https://www.youtube.com/watch?v=abc&t=642s");
    expect([abc.lastVisitTime, abc.visitCount, abc.typedCount]).toEqual([200, 5, 1]);
  });
});
