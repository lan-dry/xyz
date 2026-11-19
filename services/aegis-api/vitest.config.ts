import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    server: {
      // Keep the Stage 2 wording-guard .mjs untransformed; Vite's TS pipeline
      // otherwise raises SyntaxError on the plain ESM script.
      deps: { external: [/check-no-bare-verified\.mjs$/] },
    },
  },
});
