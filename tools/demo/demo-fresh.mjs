#!/usr/bin/env node
/**
 * pnpm demo:fresh
 *
 * Gives Demo Bank (slug demo-bank) a clean slate:
 *   1. wipe        pilot:wipe-tenant --slug demo-bank --confirm demo-bank --allow-missing
 *   2. re-provision pilot:provision-demo-tenant
 *   3. re-seed     pilot:seed-history
 *
 * DEMO_BANK_INGEST_KEY is optional. When set, that exact secret is re-stored (same key across
 * refreshes). When unset, a new key is generated once for this run, printed at the end, and used
 * for provision + seed.
 *
 * Needs, in your shell (never in the repo, never printed except the one-time generated key):
 *   AEGIS_ALLOW_TENANT_WIPE=1     explicit operator opt-in for this run (an .env file cannot supply it)
 *   MIGRATION_DATABASE_URL        schema OWNER connection (the wipe function is owner-only)
 *   PLATFORM_BOOTSTRAP_SECRET     authorises tenant provisioning on the ID service
 * and the uncommitted .demo-tenant-emails.local.json (organization.slug must be demo-bank).
 *
 * Flags:
 *   --dry-run   only print what a wipe would remove (row counts); change nothing
 *
 * Production image (Railway): node /app/tools/demo/dist/demo-fresh.mjs
 * Local: pnpm demo:fresh   or   node tools/demo/demo-fresh.mjs
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Compiled wipe CLI is wipe-tenant.mjs in dist/ (tsc emits .mjs from .mts).
const runningFromDist = existsSync(join(here, "wipe-tenant.mjs"));
const toolDir = runningFromDist ? here : join(here, "dist");
const sourceDir = runningFromDist ? resolve(here, "..") : here;

function findRepoRoot() {
  let dir = here;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(here, runningFromDist ? "../.." : "../..");
}

const root = findRepoRoot();
const SLUG = "demo-bank";
const ALLOW_ENV = "AEGIS_ALLOW_TENANT_WIPE";
const argv = new Set(process.argv.slice(2));
const dryRun = argv.has("--dry-run");

function die(message) {
  console.error(`\n  demo:fresh: ${message}\n`);
  process.exit(1);
}

function generateIngestKey() {
  return `aegis_${randomBytes(24).toString("hex")}`;
}

// Fill unset variables from .env, but an .env file can never authorise a wipe.
const allowBefore = process.env[ALLOW_ENV];
for (const name of [".env.local", ".env"]) {
  const path = join(root, name);
  if (!existsSync(path)) continue;
  let text = readFileSync(path, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = t.slice(eq + 1).trim();
  }
}
if (allowBefore === undefined) delete process.env[ALLOW_ENV];

// ---- preconditions (nothing is deleted until all pass) ---------------------------------------
const missing = [];
if (!dryRun && process.env[ALLOW_ENV]?.trim() !== "1") missing.push(`${ALLOW_ENV}=1 (explicit opt-in)`);
if (!process.env.MIGRATION_DATABASE_URL?.trim()) missing.push("MIGRATION_DATABASE_URL (owner role)");
if (!dryRun) {
  if (!process.env.PLATFORM_BOOTSTRAP_SECRET?.trim()) missing.push("PLATFORM_BOOTSTRAP_SECRET");
}
if (missing.length) die(`missing in your environment: ${missing.join(", ")}. Nothing was changed.`);

let generatedKey = false;
let stableKey = process.env.DEMO_BANK_INGEST_KEY?.trim() || "";
if (!dryRun) {
  if (stableKey && (stableKey.length < 32 || /\s/.test(stableKey))) {
    die("DEMO_BANK_INGEST_KEY must be at least 32 characters with no whitespace.");
  }
  if (!stableKey) {
    stableKey = generateIngestKey();
    process.env.DEMO_BANK_INGEST_KEY = stableKey;
    generatedKey = true;
  }
}

if (!dryRun) {
  const tenantPath = resolve(
    process.env.DEMO_TENANT_FILE?.trim() || join(root, ".demo-tenant-emails.local.json"),
  );
  if (!existsSync(tenantPath)) {
    die(`missing ${tenantPath} (copy .demo-tenant-emails.local.example.json). Nothing was changed.`);
  }
  try {
    let raw = readFileSync(tenantPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const slug = JSON.parse(raw)?.organization?.slug?.trim() || SLUG;
    if (slug !== SLUG) {
      die(`${tenantPath} has organization.slug "${slug}"; demo:fresh only resets "${SLUG}". Nothing was changed.`);
    }
  } catch (err) {
    if (err instanceof SyntaxError) die(`${tenantPath} is not valid JSON. Nothing was changed.`);
    throw err;
  }
}

function runTool(label, baseName, args = [], env = {}) {
  console.log(`\n=== ${label} ===`);
  const compiled = join(toolDir, `${baseName}.mjs`);
  const source = join(sourceDir, `${baseName}.mts`);
  /** @type {string[]} */
  let cmd;
  if (existsSync(compiled)) {
    cmd = ["node", compiled, ...args];
  } else if (existsSync(source)) {
    cmd = ["pnpm", "--filter", "@salanor/demo-tools", "exec", "tsx", `${baseName}.mts`, ...args];
  } else {
    die(`Neither ${compiled} nor ${source} found. Run: pnpm --filter @salanor/demo-tools build`);
  }
  const res = spawnSync(cmd[0], cmd.slice(1), {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) die(`${label} failed (exit ${res.status}). Stopped; later steps were not run.`);
}

console.log(`demo:fresh for "${SLUG}"${dryRun ? " (DRY RUN)" : ""}`);

if (dryRun) {
  runTool("1/1 dry run: what a wipe would remove", "wipe-tenant", ["--slug", SLUG, "--allow-missing"]);
  console.log("\nDry run only. Nothing was changed.\n");
  process.exit(0);
}

runTool("1/3 wipe Demo Bank", "wipe-tenant", ["--slug", SLUG, "--confirm", SLUG, "--allow-missing"]);

// Connector private keys are kept across wipe, but outbox/delivered state must not be —
// otherwise seed reuses fixed idempotency keys against a different local event hash.
{
  const connectorsDir =
    process.env.AEGIS_CONNECTORS_DIR?.trim() || join(root, ".data", "connectors");
  if (existsSync(connectorsDir)) {
    for (const src of ["src_los", "src_core", "src_pay"]) {
      const statePath = join(connectorsDir, src, "state");
      if (existsSync(statePath)) {
        rmSync(statePath, { recursive: true, force: true });
        console.log(`  Cleared Connector state: ${statePath}`);
      }
    }
  }
}

runTool("2/3 re-provision Demo Bank", "provision-demo-tenant");
runTool("3/3 re-seed history", "seed-history", [], {
  AEGIS_INGEST_KEY: process.env.DEMO_BANK_INGEST_KEY,
});

if (generatedKey) {
  console.log(
    [
      "",
      "  ============================================================",
      "  INGEST KEY (generated for this fresh run; shown once).",
      "  Save it as DEMO_BANK_INGEST_KEY if you want the same key next time:",
      "",
      `    DEMO_BANK_INGEST_KEY=${stableKey}`,
      "  ============================================================",
    ].join("\n"),
  );
}

console.log(
  `\ndemo:fresh complete. Demo Bank has a new organisation id (see step 2 output); ${
    generatedKey ? "a new ingest key was printed above." : "the ingest key is unchanged."
  }\nIf the bank simulator pins AEGIS_ORGANIZATION_ID, update it to the new id.\n`,
);
