/**
 * Run due monthly compliance export schedules (cron: daily or hourly).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import "../db/load-env.js";
import { closePool, getPool } from "../db/pool.js";
import { runDueComplianceSchedules } from "./schedule-runner.js";

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

const pool = getPool();
const results = await runDueComplianceSchedules(pool);
console.log(JSON.stringify({ ok: true, ran: results.length, results }, null, 2));
await closePool();
