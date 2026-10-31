import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../../dist", import.meta.url));

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

/** A page with a known title and no network access. */
export const pageUrl = (title: string) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><h1>${title}</h1>`)}`;

/** Press a key that should close the page. The press itself may fail because the page is already gone. */
export async function pressAndClose(page: Page, key: string): Promise<void> {
  await Promise.all([page.waitForEvent("close"), page.keyboard.press(key).catch(() => {})]);
}
