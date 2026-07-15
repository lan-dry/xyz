/**
 * Process pending compliance_export jobs (local file storage).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import "../db/load-env.js";
import { getPool } from "../db/pool.js";
import { processPendingComplianceExports } from "./worker.js";
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

const organizationId = process.env.DEMO_ORGANIZATION_ID;
const pool = getPool();
const scheduled = await runDueComplianceSchedules(pool);
const processed = await processPendingComplianceExports(
  pool,
  organizationId ?? undefined,
);
console.log(
  JSON.stringify({ ok: true, scheduled: scheduled.length, processed, scheduled_results: scheduled }, null, 2),
);
await pool.end();
