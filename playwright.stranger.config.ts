import { defineConfig } from "playwright/test";

/**
 * Optional public-gate smoke. Release blocker is `pnpm launch:stranger`.
 * Run: pnpm exec playwright test -c playwright.stranger.config.ts
 * Requires a live API (AEGIS_API_URL).
 */
export default defineConfig({
  testDir: "tools/launch",
  testMatch: "stranger-test.spec.ts",
  timeout: 60_000,
  retries: 0,
  use: {
    extraHTTPHeaders: { "content-type": "application/json" },
  },
});
