/** "https://www.example.com/path/" → "example.com/path" */
export function toDisplayUrl(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}
