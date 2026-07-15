import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
for (const name of [".env.local", ".env"]) {
  const path = resolve(root, name);
  if (existsSync(path)) {
    config({ path, override: false });
  }
}
