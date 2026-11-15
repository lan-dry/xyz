#!/usr/bin/env node
/**
 * One-command forensic demo bring-up.
 * Starts Postgres (docker), migrates, seeds keys + banking pack + approvers,
 * starts API + console, prints URLs and logins.
 *
 * Requires: AEGIS_DEMO_MODE=true, AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars).
 * No default password.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...opts.env },
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

function bg(cmd, args, logLabel) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
    detached: false,
  });
  child.on("exit", (code) => {
    console.error(`[demo:up] ${logLabel} exited ${code}`);
  });
  return child;
}

async function waitHttp(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  loadDotEnv();
  process.env.AEGIS_DEMO_MODE = "true";
  if (process.env.NODE_ENV === "production" || process.env.AEGIS_ENV === "production") {
    console.error("Refusing demo:up in production NODE_ENV/AEGIS_ENV");
    process.exit(1);
  }
  const pass = process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim();
  if (!pass || pass.length < 10) {
    console.error(
      "Set AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars). No default is provided.",
    );
    process.exit(1);
  }

  const dbUrl =
    process.env.DEMO_DATABASE_URL?.trim() ||
    "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
  process.env.DATABASE_URL = dbUrl;
  process.env.DATABASE_URL_UNPOOLED = dbUrl;
  process.env.AEGIS_API_PORT = process.env.AEGIS_API_PORT || "8080";
  process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 =
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 ||
    process.env.DEV_SIGNING_PRIVATE_KEY_B64;
  process.env.AEGIS_RECEIPT_KEY_ID =
    process.env.AEGIS_RECEIPT_KEY_ID || "receipt_dev";

  console.log("== demo:up ==");
  console.log(`DATABASE_URL=${dbUrl.replace(/:[^:@]+@/, ":***@")}`);

  // Ensure docker postgres on 5435
  try {
    await run("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      "aegis-pg-demo",
    ]);
  } catch {
    console.log("Starting aegis-pg-demo on :5435…");
    await run("docker", [
      "run",
      "-d",
      "--name",
      "aegis-pg-demo",
      "-e",
      "POSTGRES_USER=salanor",
      "-e",
      "POSTGRES_PASSWORD=salanor",
      "-e",
      "POSTGRES_DB=aegis",
      "-p",
      "5435:5432",
      "postgres:16-alpine",
    ]);
    await new Promise((r) => setTimeout(r, 4000));
  }

  await run("pnpm", ["--filter", "aegis-api", "db:migrate"]);
  await run("pnpm", ["--filter", "aegis-api", "db:local:pilot-fixture"]).catch(
    () => console.warn("pilot-fixture skipped (may already exist)"),
  );

  const org =
    process.env.AEGIS_ORGANIZATION_ID?.trim() ||
    "cf2acb42-e697-47c5-ac42-d68487f01bae";
  process.env.AEGIS_ORGANIZATION_ID = org;

  await run("pnpm", [
    "--filter",
    "aegis-api",
    "pack:apply",
    "--",
    "--pack",
    "banking",
    "--org",
    org,
    "--seed-approvers",
  ]);

  console.log("Starting aegis-api on :8080…");
  bg("pnpm", ["--filter", "aegis-api", "exec", "tsx", "src/index.ts"], "api");
  process.env.NEXT_PUBLIC_AEGIS_API_URL =
    process.env.NEXT_PUBLIC_AEGIS_API_URL || "http://localhost:8080";
  console.log("Starting web-console…");
  bg("pnpm", ["--filter", "@salanor/web-console", "dev"], "console");

  await waitHttp("http://localhost:8080/health").catch(() =>
    waitHttp("http://localhost:8080/"),
  );

  console.log(`
========================================
Demo is up (AEGIS_DEMO_MODE=true)
  API:     http://localhost:8080
  Console: http://localhost:3000/aegis
  Org:     ${org}

Demo logins (password = AEGIS_DEMO_APPROVAL_PASSWORD from your env):
  officer@demo.test   (credit_officer)
  manager@demo.test   (credit_manager)
  comp@demo.test      (compliance_officer)
  head@demo.test      (head_of_compliance)
  dpo@demo.test       (dpo)

Next:
  pnpm demo:rehearse
  pnpm --filter aegis-api scenario:live -- --approvals=http
========================================
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
