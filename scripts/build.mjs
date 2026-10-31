// Bundles the extension into dist/. Pass --watch to rebuild on change.
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;
const watch = process.argv.includes("--watch");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const copyStatic = async () => {
  await cp(`${root}src/manifest.json`, `${dist}/manifest.json`);
  await cp(`${root}src/popup/palette.html`, `${dist}/palette.html`);
};

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: {
    "service-worker": `${root}src/background/service-worker.ts`,
    palette: `${root}src/popup/main.ts`,
  },
  loader: { ".css": "text" },
  outdir: dist,
  bundle: true,
  format: "esm",
  target: "chrome121",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  plugins: [{ name: "copy-static", setup: (b) => b.onEnd(copyStatic) }],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
