import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Built by `pnpm test:e2e` with --e2e: see scripts/build.mjs.
const dist = fileURLToPath(new URL("../../dist-e2e", import.meta.url));

/** Helium by default; set BROWSER to test another Chromium build. */
const executablePath = process.env.BROWSER ?? "/Applications/Helium.app/Contents/MacOS/Helium";

export const test = base.extend<{ context: BrowserContext; worker: Worker; extensionId: string }>({
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), "palette-e2e-"));
    const context = await chromium.launchPersistentContext(profile, {
      executablePath,
      headless: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    // Serve test pages locally; nothing goes to the network.
    await context.route(`${TEST_ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      const title = decodeURIComponent(url.pathname.slice(1)) || "Test page";
      const csp = url.searchParams.get("csp");
      return route.fulfill({
        contentType: "text/html",
        headers: csp ? { "Content-Security-Policy": csp } : {},
        body: `<title>${title}</title><h1>${title}</h1><input id="page-input" autofocus>`,
      });
    });
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

const TEST_ORIGIN = "https://palette.test";

/** A real https page served by the route above; content scripts can be injected into it. */
export const httpsUrl = (title: string, { csp }: { csp?: string } = {}) => {
  const url = new URL(`${TEST_ORIGIN}/${encodeURIComponent(title)}`);
  if (csp) url.searchParams.set("csp", csp);
  return url.href;
};

/** Does what pressing the shortcut does, for the tab showing `page`. */
export async function pressShortcut(worker: Worker, page: Page): Promise<void> {
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
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
