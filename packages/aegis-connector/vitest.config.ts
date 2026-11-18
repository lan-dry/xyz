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
  },
});
