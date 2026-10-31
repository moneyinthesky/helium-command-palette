import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Built by `pnpm test:e2e` with --e2e: see scripts/build.mjs.
const dist = fileURLToPath(new URL("../../dist-e2e", import.meta.url));

/** Helium by default; set BROWSER to test another Chromium build. */
const executablePath = process.env.BROWSER ?? "/Applications/Helium.app/Contents/MacOS/Helium";

let origin = "";

/** Helium's bundled uBlock Origin, which `--disable-extensions-except` leaves running. */
const UBLOCK_ID = "blockjmkbacgjkknlgpkjjiijinjdanf";

/**
 * Turns off uBlock Origin, if it's installed. While its filter lists load after
 * launch it reloads every page that opened in the meantime, which wipes the
 * overlay mid-test and drops keystrokes. chrome.management can't touch it, so
 * this flips its switch on chrome://extensions.
 */
async function disableUblock(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await page.goto("chrome://extensions");
  await page.locator("extensions-item").first().waitFor(); // this extension is always listed
  const toggle = page.locator(`extensions-item#${UBLOCK_ID} #enableToggle`);
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await expect.poll(() => toggle.evaluate((el) => (el as HTMLInputElement).checked)).toBe(false);
  }
  await page.close();
}

type Fixtures = { context: BrowserContext; worker: Worker; extensionId: string };

export const test = base.extend<Fixtures, { server: void }>({
  // Serves test pages from 127.0.0.1, so nothing goes to the network. A real
  // server rather than Playwright's request interception, which sometimes
  // drops navigations the extension starts with chrome.tabs.update.
  server: [
    async ({}, use) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const title = decodeURIComponent(url.pathname.slice(1)) || "Test page";
        const csp = url.searchParams.get("csp");
        res.writeHead(200, { "Content-Type": "text/html", ...(csp ? { "Content-Security-Policy": csp } : {}) });
        res.end(`<title>${title}</title><h1>${title}</h1><input id="page-input" autofocus>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await use();
      server.close();
    },
    { scope: "worker", auto: true },
  ],
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), "palette-e2e-"));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath,
      headless: true,
      args: [
        `--disable-extensions-except=${dist}`,
        `--load-extension=${dist}`,
        // Nothing but the local test server resolves, so no test can reach the
        // network, even through navigations Playwright's routing doesn't see.
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      ],
    });
    await disableUblock(context);
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },
  worker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;

/** A real web page served by the local test server; content scripts can be injected into it. */
export const webUrl = (title: string, { csp }: { csp?: string } = {}) => {
  const url = new URL(`${origin}/${encodeURIComponent(title)}`);
  if (csp) url.searchParams.set("csp", csp);
  return url.href;
};

/** Does what pressing the shortcut does, for the tab showing `page`. */
export async function pressShortcut(worker: Worker, page: Page): Promise<void> {
  await worker.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
    // Exposed only in the --e2e build.
    await (globalThis as unknown as { __test: { togglePalette(t?: chrome.tabs.Tab): Promise<void> } }).__test.togglePalette(tab);
  }, page.url());
}

/** A page with a known title and no network access. */
export const pageUrl = (title: string) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><h1>${title}</h1>`)}`;

/** Press a key that should close the page. The press itself may fail because the page is already gone. */
export async function pressAndClose(page: Page, key: string): Promise<void> {
  await Promise.all([page.waitForEvent("close"), page.keyboard.press(key).catch(() => {})]);
}

/** Whether the tab showing `url` is its window's active tab. */
export async function isActive(worker: Worker, url: string): Promise<boolean> {
  return worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.active ?? false, url);
}
