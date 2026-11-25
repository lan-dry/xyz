import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Test against SDK sources so tests do not require a prior build.
      "@salanor/aegis-sdk": fileURLToPath(new URL("../aegis-sdk/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // Windows + vitest forks/tinypool has flaked under Nx parallel load;
    // threads + single worker keeps sequence tests deterministic.
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
