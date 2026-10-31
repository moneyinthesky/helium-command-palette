/** True only in the end-to-end test build (pnpm build --e2e). */
declare const __E2E__: boolean;

/** Unique per build; see scripts/build.mjs. */
declare const __BUILD_ID__: string;
