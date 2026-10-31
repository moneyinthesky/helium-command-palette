/** True only in the end-to-end test build (pnpm build --e2e). */
declare const __E2E__: boolean;

/** Unique per build and rebuild; see scripts/build.mjs. */
declare module "build-id" {
  const id: string;
  export default id;
}
