/**
 * Wrapper — org resolution lives in tools/demo/ensure-pilot-policy.mts
 * Usage: pnpm pilot:ensure-policy
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = resolve(root, "tools/demo/ensure-pilot-policy.mts");
const args = process.argv.slice(2);

const result = spawnSync("pnpm", ["exec", "tsx", script, ...args], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
