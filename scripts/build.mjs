// Bundles the extension into dist/.
//   --watch  rebuild on change
//   --e2e    test build in dist-e2e/: open shadow roots, host access to every
//            page so tests can inject without a real shortcut press, and a
//            test hook on the service worker
import * as esbuild from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const watch = process.argv.includes("--watch");
const e2e = process.argv.includes("--e2e");
const dist = `${root}${e2e ? "dist-e2e" : "dist"}`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const copyStatic = async () => {
  const manifest = JSON.parse(await readFile(`${root}src/manifest.json`, "utf8"));
  if (e2e) manifest.host_permissions = ["<all_urls>"];
  await writeFile(`${dist}/manifest.json`, JSON.stringify(manifest, null, 2));
  await cp(`${root}src/popup/palette.html`, `${dist}/palette.html`);
};

/** @type {esbuild.BuildOptions} */
const shared = {
  outdir: dist,
  bundle: true,
  target: "chrome121",
  loader: { ".css": "text" },
  define: { __E2E__: String(e2e) },
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

const builds = [
  {
    ...shared,
    entryPoints: {
      "service-worker": `${root}src/background/service-worker.ts`,
      palette: `${root}src/popup/main.ts`,
    },
    format: "esm",
    plugins: [{ name: "copy-static", setup: (b) => b.onEnd(copyStatic) }],
  },
  // Injected with chrome.scripting.executeScript, which runs classic scripts only.
  { ...shared, entryPoints: { overlay: `${root}src/overlay/main.ts` }, format: "iife" },
];

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
