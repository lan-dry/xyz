/**
 * Reset local Postgres to dev seed baseline.
 * WARNING: destroys all local DB data in the compose volume.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("== pilot:reset (destroy local DB volume) ==");
run("docker", ["compose", "down", "-v"]);
run("docker", ["compose", "up", "-d"]);
console.log("Waiting for Postgres…");
run("pnpm", ["db:migrate"]);
run("pnpm", ["db:seed"]);
console.log("\n=== RESET COMPLETE ===");
console.log("Next: pnpm dev && pnpm pilot:agent");
