#!/usr/bin/env node
/**
 * pnpm bank:down — stop processes started by bank:up and tear down bank-core Postgres.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const pidFile = join(here, ".bank-simulator", "bank-up.pids.json");

console.log("\n  bank:down\n");

if (existsSync(pidFile)) {
  try {
    const data = JSON.parse(readFileSync(pidFile, "utf8"));
    for (const key of ["bank_simulator", "demo_bureau"]) {
      const row = data[key];
      if (row?.pid) {
        try {
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/PID", String(row.pid), "/T", "/F"], { stdio: "ignore" });
          } else {
            process.kill(row.pid, "SIGTERM");
          }
          console.log(`  stopped ${key} pid ${row.pid}`);
        } catch {
          console.log(`  ${key} pid ${row.pid} already gone`);
        }
      }
    }
  } catch (err) {
    console.warn("  could not read pid file:", err instanceof Error ? err.message : err);
  }
  try {
    unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
} else {
  console.log("  no pid file (bank:up may not have been run from this tree)");
}

const compose = join(here, "docker-compose.bank.yml");
try {
  execFileSync("docker", ["info"], { cwd: root, stdio: "ignore", timeout: 5_000 });
  execFileSync("docker", ["compose", "-f", compose, "down"], {
    cwd: root,
    stdio: "inherit",
    timeout: 30_000,
  });
  console.log("  docker bank-core stopped");
} catch (err) {
  console.warn(
    "  docker compose down skipped/failed:",
    err instanceof Error ? err.message : err,
  );
}

console.log("");
