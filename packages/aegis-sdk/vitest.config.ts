import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Same Windows/Nx tinypool flake surface as the connector package.
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
