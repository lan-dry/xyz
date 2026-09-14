import "./load-env.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./pool.js";

const SEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tools/seed/dev.sql",
);

const sql = readFileSync(SEED_PATH, "utf8");

try {
  await getPool().query(sql);
  console.log("Applied dev seed from tools/seed/dev.sql");
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await closePool();
}
