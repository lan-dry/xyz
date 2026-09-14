import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root `.env` (same loader as apps/web/next.config.js). */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const require = createRequire(join(repoRoot, "node_modules/next/package.json"));
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");

loadEnvConfig(repoRoot);
