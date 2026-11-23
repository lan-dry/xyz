/**
 * One-shot sandbox expiry tick (emails + read-only + archive).
 * Prefer folding into housekeeping; this CLI is for founder drills and tests.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import "../db/load-env.js";
import { closePool, getPool } from "../db/pool.js";
import { runSandboxLifecycleTick } from "./sandbox-expiry-emails.js";

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

const root = resolve(import.meta.dirname, "../../..");
const outDir =
  process.env.SANDBOX_EXPIRY_EMAIL_CAPTURE_DIR?.trim() ||
  resolve(root, "docs/launch/_raw");
process.env.SANDBOX_EXPIRY_EMAIL_CAPTURE_DIR = outDir;
mkdirSync(outDir, { recursive: true });

const pool = getPool();
try {
  const summary = await runSandboxLifecycleTick(pool);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(outDir, `sandbox-expiry-tick-${stamp}.json`);
  writeFileSync(path, JSON.stringify({ ok: true, ...summary }, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, artifact: path, ...summary }, null, 2));
} finally {
  await closePool();
}
