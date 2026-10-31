/** "https://www.example.com/path/" → "example.com/path" */
export function toDisplayUrl(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/** Query parameters that track where a click came from, not which page it is. */
const TRACKING_PARAMS =
  /^(utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref|ref_|ref_src|ref_url)$/;

/** Site-specific parameters that don't change the page. */
const IGNORED_PARAMS_BY_SITE: { host: RegExp; params: RegExp }[] = [
  // Timestamp and share ids.
  { host: /^(m\.)?youtube\.com$|^youtu\.be$/, params: /^(t|si|feature|pp)$/ },
  // Amazon's click and search tracking, on every country's site.
  {
    host: /(^|\.)amazon\.(com|ca|com\.mx|com\.br|co\.uk|de|fr|it|es|nl|se|pl|com\.be|ie|in|co\.jp|com\.au|sg|ae|sa|eg|com\.tr)$/,
    params: /^(pd_rd_.+|pf_rd_.+|content-id|crid|dib|dib_tag|keywords|psc|qid|sprefix|sr|th|_encoding)$/,
  },
];

/** The URL without fragment, "www.", trailing slash or ignored parameters; null if unparseable. */
function normalize(url: string): { page: string; query: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const ignored = IGNORED_PARAMS_BY_SITE.find((site) => site.host.test(host))?.params;
  const params = [...u.searchParams]
    .filter(([k]) => !TRACKING_PARAMS.test(k) && !ignored?.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : "";
  return {
    page: `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}${path}`,
    query: params.length ? `?${new URLSearchParams(params)}` : "",
  };
}

/**
 * Key for "is this the same page?". Ignores the #fragment, tracking parameters,
 * "www.", a trailing slash and parameter order. Other query parameters still
 * count: youtube.com/watch?v=a and ?v=b are different videos.
 */
export function pageKey(url: string): string {
  const n = normalize(url);
  return n ? n.page + n.query : url;
}

/**
 * Second key for "is this the same page?", catching tracking parameters no list
 * knows about: same site and path, and the same title, whatever the query
 * string. Null when the title is missing or just the URL.
 */
export function titleKey(url: string, title: string): string | null {
  const n = normalize(url);
  const t = title.trim();
  if (!n || !t || t === url || t === toDisplayUrl(url)) return null;
  return `${n.page} ${t}`;
}

const OPENABLE = new Set(["http:", "https:", "file:", "chrome:"]);

/** Whether the palette may navigate to this URL. Keeps javascript:, data: and the like out. */
export function isOpenable(url: string): boolean {
  try {
    return OPENABLE.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** What was typed, read as an address. */
export interface TypedUrl {
  url: string;
  /**
   * Unmistakably an address: it has a scheme, path, query or port, or names
   * localhost or an IP address. A bare "example.com" could still be a search.
   */
  certain: boolean;
}

/** A host, then optionally a port and a path, query or fragment. No scheme, spaces or "user@". */
const SCHEMELESS = /^(?<host>[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*|\[[0-9a-f:.]+\])(?::(?<port>\d+))?(?<rest>[/?#]\S*)?$/iu;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** A top-level domain: letters, or punycode. */
const TLD = /^(\p{L}{2,63}|xn--[a-z0-9-]+)$/u;

/** File extensions that look like a top-level domain: "node.js" or "package.json" is a search, not a site. */
const FILE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "ts", "jsx", "tsx", "json", "txt", "html", "htm", "css", "scss", "yml", "yaml",
  "toml", "lock", "log", "exe", "dll", "png", "jpg", "jpeg", "gif", "svg", "webp", "pdf", "doc", "docx",
  "xls", "xlsx", "csv", "zip", "tar", "gz", "dmg", "java", "kt", "swift", "rb", "cpp", "hpp", "mp3",
  "mp4", "mov", "wav", "ini", "cfg", "conf", "env",
]);

function parseOpenable(text: string, certain: boolean): TypedUrl | null {
  try {
    const { href } = new URL(text);
    return isOpenable(href) ? { url: href, certain } : null;
  } catch {
    return null;
  }
}

/**
 * The URL to open when the query looks like an address, or null when it
 * doesn't. Local hosts and IP addresses get http://, since dev servers rarely
 * have certificates; everything else without a scheme gets https://.
 */
export function typedUrl(query: string): TypedUrl | null {
  const text = query.trim();
  if (!text || /\s/.test(text)) return null;
  if (/^(https?|file|chrome):\/\//i.test(text)) return parseOpenable(text, true);

  const groups = SCHEMELESS.exec(text)?.groups;
  if (!groups) return null;
  const host = groups.host!.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || IPV4.test(host) || host.startsWith("[")) {
    return parseOpenable(`http://${text}`, true);
  }
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (host.includes(".") && TLD.test(tld) && !FILE_EXTENSIONS.has(tld)) {
    return parseOpenable(`https://${text}`, Boolean(groups.port || groups.rest));
  }
  // A name on the local network with a port, like "devbox:8080".
  if (groups.port) return parseOpenable(`http://${text}`, true);
  return null;
}
