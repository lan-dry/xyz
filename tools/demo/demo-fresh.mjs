#!/usr/bin/env node
/* eslint-env node */
/**
 * pnpm demo:fresh
 *
 * Gives Demo Bank (slug demo-bank) a clean slate, with the SAME ingest key as before:
 *   1. wipe        pilot:wipe-tenant --slug demo-bank --confirm demo-bank --allow-missing
 *   2. re-provision pilot:provision-demo-tenant   (stores DEMO_BANK_INGEST_KEY, hashed)
 *   3. re-seed     pilot:seed-history             (tools/demo/demo-bank-history.example.json)
 *
 * Idempotent: a missing tenant is simply created; re-running just resets again. The key never
 * changes because the secret comes from DEMO_BANK_INGEST_KEY, not from a random mint.
 *
 * Needs, in your shell (never in the repo, never printed):
 *   AEGIS_ALLOW_TENANT_WIPE=1     explicit operator opt-in for this run (an .env file cannot supply it)
 *   MIGRATION_DATABASE_URL        schema OWNER connection (the wipe function is owner-only)
 *   PLATFORM_BOOTSTRAP_SECRET     authorises tenant provisioning on the ID service
 *   DEMO_BANK_INGEST_KEY          the stable Demo Bank ingest key (>= 32 chars)
 * and the uncommitted .demo-tenant-emails.local.json (organization.slug must be demo-bank).
 *
 * Flags:
 *   --dry-run   only print what a wipe would remove (row counts); change nothing
 *
 * Every precondition is checked BEFORE anything is deleted, so a missing secret can never leave
 * Demo Bank wiped but un-reprovisionable.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLUG = "demo-bank";
const ALLOW_ENV = "AEGIS_ALLOW_TENANT_WIPE";
const argv = new Set(process.argv.slice(2));
const dryRun = argv.has("--dry-run");

function die(message) {
  console.error(`\n  demo:fresh: ${message}\n`);
  process.exit(1);
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
  const key = process.env.DEMO_BANK_INGEST_KEY?.trim();
  if (!key) missing.push("DEMO_BANK_INGEST_KEY (stable ingest key)");
  else if (key.length < 32 || /\s/.test(key)) {
    die("DEMO_BANK_INGEST_KEY must be at least 32 characters with no whitespace.");
  }
}
if (missing.length) die(`missing in your environment: ${missing.join(", ")}. Nothing was changed.`);

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

function runTool(label, file, args = [], env = {}) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(
    "pnpm",
    ["--filter", "@salanor/demo-tools", "exec", "tsx", file, ...args],
    { cwd: root, stdio: "inherit", shell: true, env: { ...process.env, ...env } },
  );
  if (res.status !== 0) die(`${label} failed (exit ${res.status}). Stopped; later steps were not run.`);
}

console.log(`demo:fresh for "${SLUG}"${dryRun ? " (DRY RUN)" : ""}`);

if (dryRun) {
  runTool("1/1 dry run: what a wipe would remove", "wipe-tenant.mts", ["--slug", SLUG, "--allow-missing"]);
  console.log("\nDry run only. Nothing was changed.\n");
  process.exit(0);
}

runTool("1/3 wipe Demo Bank", "wipe-tenant.mts", ["--slug", SLUG, "--confirm", SLUG, "--allow-missing"]);
runTool("2/3 re-provision Demo Bank (stable ingest key)", "provision-demo-tenant.mts");
runTool("3/3 re-seed history", "seed-history.mts", [], {
  AEGIS_INGEST_KEY: process.env.DEMO_BANK_INGEST_KEY,
});

console.log(
  `\ndemo:fresh complete. Demo Bank has a new organisation id (see step 2 output); the ingest key is unchanged.\nIf the bank simulator pins AEGIS_ORGANIZATION_ID, update it to the new id.\n`,
);
