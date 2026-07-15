import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load repo-root `.env.local` or `.env` (monorepo root is four levels above `src/db`). */
export function loadMonorepoEnv(): void {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  for (const name of [".env.local", ".env"]) {
    const path = resolve(repoRoot, name);
    if (existsSync(path)) {
      config({ path });
      return;
    }
  }
}

loadMonorepoEnv();
