import { describe, expect, it } from "vitest";
import { typedUrl } from "../../src/core/url";

describe("typedUrl", () => {
  it.each([
    ["https://example.com/a?b=c#d", "https://example.com/a?b=c#d"],
    ["HTTP://Example.com", "http://example.com/"],
    ["chrome://extensions", "chrome://extensions"],
    ["file:///Users/me/notes.txt", "file:///Users/me/notes.txt"],
  ])("opens %s as typed", (text, url) => {
    expect(typedUrl(text)).toEqual({ url, certain: true });
  });

  it.each([
    ["localhost", "http://localhost/"],
    ["localhost:3000/admin", "http://localhost:3000/admin"],
    ["app.localhost:5173", "http://app.localhost:5173/"],
    ["127.0.0.1:8080", "http://127.0.0.1:8080/"],
    ["192.168.1.1", "http://192.168.1.1/"],
    ["[::1]:3000", "http://[::1]:3000/"],
    ["devbox:8080", "http://devbox:8080/"],
  ])("opens local address %s over http", (text, url) => {
    expect(typedUrl(text)).toEqual({ url, certain: true });
  });

  it.each([
    ["github.com/anthropics", "https://github.com/anthropics"],
    ["example.com:8443", "https://example.com:8443/"],
    ["news.ycombinator.com?p=2", "https://news.ycombinator.com/?p=2"],
  ])("opens %s over https", (text, url) => {
    expect(typedUrl(text)).toEqual({ url, certain: true });
  });

  it("treats a bare domain as an address that might be a search", () => {
    expect(typedUrl("  example.com ")).toEqual({ url: "https://example.com/", certain: false });
    expect(typedUrl("münchen.de")).toEqual({ url: "https://xn--mnchen-3ya.de/", certain: false });
  });

  it.each([
    "",
    "rust lifetimes",
    "github.com/a b",
    "node.js",
    "package.json",
    "1.5",
    "v1.2.3",
    "e.g",
    "i.e.",
    "hello",
    "me@example.com",
    "javascript:alert(1)",
    "data:text/html,hi",
    "localhost:99999",
  ])("leaves %j to search", (text) => {
    expect(typedUrl(text)).toBeNull();
  });
});
