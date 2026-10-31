import { describe, expect, it } from "vitest";
import { matchFields, matchSubsequence, matchSubstring, tokenize } from "../../src/core/fuzzy";

describe("matchSubstring", () => {
  it("scores a prefix above a word start above a mid-word match", () => {
    const prefix = matchSubstring("git", "GitHub")!;
    const word = matchSubstring("hub", "Git hub")!;
    const mid = matchSubstring("hub", "GitHub")!;
    expect(prefix.score).toBeGreaterThan(word.score);
    expect(word.score).toBeGreaterThan(mid.score);
  });

  it("prefers a later occurrence at a word boundary", () => {
    expect(matchSubstring("pr", "Approve pr")!.indices).toEqual([8, 9]);
  });

  it("returns null when absent", () => {
    expect(matchSubstring("xyz", "GitHub")).toBeNull();
  });
});

describe("matchSubsequence", () => {
  it("matches characters in order", () => {
    expect(matchSubsequence("gtb", "GitHub")!.indices).toEqual([0, 2, 5]);
  });

  it("rejects out-of-order characters", () => {
    expect(matchSubsequence("bg", "GitHub")).toBeNull();
  });

  it("scores well below a substring match", () => {
    expect(matchSubsequence("gthb", "GitHub")!.score).toBeLessThan(matchSubstring("git", "GitHub")!.score);
  });
});

describe("matchFields", () => {
  it("requires every token, in any order, across title and URL", () => {
    const m = matchFields(tokenize("pull github"), "Pull requests", "github.com/pulls");
    expect(m).not.toBeNull();
    expect(m!.titleMatches).toEqual([0, 1, 2, 3]);
    expect(m!.urlMatches).toEqual([0, 1, 2, 3, 4, 5]);
    expect(matchFields(tokenize("pull gitlab"), "Pull requests", "github.com/pulls")).toBeNull();
  });

  it("does not fuzzy-match URLs", () => {
    expect(matchFields(["gcm"], "Inbox", "mail.google.com/mail")).toBeNull();
  });
});
