/**
 * Hourly housekeeping: expire stale approvals, fail orphaned RUNNING traces.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import "../db/load-env.js";
import { closePool, getPool } from "../db/pool.js";
import { runGlobalHousekeeping } from "./housekeeping.js";

function loadEnvFile(): void {
  const root = resolve(import.meta.dirname, "../../..");
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

const results = await runGlobalHousekeeping(getPool());
const summary = {
  ok: true,
  organizations: results.length,
  expired_approvals: results.reduce((n, r) => n + r.expired_approvals, 0),
  stale_traces_failed: results.reduce((n, r) => n + r.stale_traces_failed, 0),
};
console.log(JSON.stringify({ ...summary, results }, null, 2));
await closePool();
