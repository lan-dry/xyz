#!/usr/bin/env node
/**
 * Headless 20-minute demo sequence against a running API (docs/DEMO.md).
 * Prints PASS/FAIL per step. Requires AEGIS_DEMO_MODE on the server,
 * AEGIS_INGEST_KEY / AEGIS_DEMO_APPROVAL_PASSWORD locally.
 *
 * Runs against a SCRATCH org (slug demo-bank-rehearsal) with its own ingest
 * key, so the presenting org (Demo Bank, slug demo-bank) is never dirtied.
 * The scratch org is wiped (pack kept) before each rehearsal.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

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

/** Run a pnpm command, echo output, return it (for DEMO_ORG_ID marker). */
function pnpmCapture(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: root,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("exit", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`pnpm ${args.join(" ")} exited ${code}`)),
    );
  });
}

/** Mirrors demoBankRehearsalIngestKey() in db/demo-bank-fixture.ts. */
function rehearsalIngestKey(baseKey) {
  const digest = createHash("sha256")
    .update(`${baseKey}:demo-bank-rehearsal`, "utf8")
    .digest("hex");
  return `aegis_rehearsal_${digest.slice(0, 32)}`;
}

function step(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  loadDotEnv();
  process.env.AEGIS_DEMO_MODE = process.env.AEGIS_DEMO_MODE || "true";
  // Same DB as demo:up (do not use .env Neon / :5432 — export would auth-fail).
  const dbUrl =
    process.env.DEMO_DATABASE_URL?.trim() ||
    "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
  process.env.DATABASE_URL = dbUrl;
  process.env.DATABASE_URL_UNPOOLED = dbUrl;
  const base = (process.env.AEGIS_API_BASE || "http://localhost:8080").replace(
    /\/$/,
    "",
  );
  const key =
    process.env.AEGIS_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_DEV_KEY?.trim();
  if (!key) {
    console.error("AEGIS_INGEST_KEY or AEGIS_INGEST_DEV_KEY required");
    process.exit(2);
  }
  if (!process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim()) {
    console.error("AEGIS_DEMO_APPROVAL_PASSWORD required");
    process.exit(2);
  }
  process.env.AEGIS_API_BASE = base;
  process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 =
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 ||
    process.env.DEV_SIGNING_PRIVATE_KEY_B64;
  process.env.AEGIS_RECEIPT_KEY_ID =
    process.env.AEGIS_RECEIPT_KEY_ID || "receipt_dev";

  // Scratch org: own agents/signing keys, ingest key, pack + approvers.
  // The presenting org (demo-bank) is not touched.
  const rehearsalKey = rehearsalIngestKey(key);
  process.env.AEGIS_INGEST_KEY = key; // base key the fixture derives from
  const fixtureOut = await pnpmCapture([
    "--filter",
    "aegis-api",
    "db:demo-bank-fixture",
    "--",
    "--rehearsal",
  ]);
  const m = fixtureOut.match(/DEMO_ORG_ID=([0-9a-f-]{36})/i);
  if (!m) {
    console.error("Rehearsal org fixture did not report DEMO_ORG_ID");
    process.exit(2);
  }
  const rehearsalOrg = m[1];
  await pnpmCapture([
    "--filter",
    "aegis-api",
    "pack:apply",
    "--",
    "--pack",
    "banking",
    "--org",
    rehearsalOrg,
    "--seed-approvers",
  ]);
  await pnpmCapture([
    "--filter",
    "aegis-api",
    "demo:reset",
    "--",
    "--org",
    rehearsalOrg,
    "--keep-pack",
  ]);
  // From here on every call (and the export child) targets the scratch org.
  process.env.AEGIS_INGEST_KEY = rehearsalKey;
  process.env.AEGIS_ORGANIZATION_ID = rehearsalOrg;
  const key2 = rehearsalKey;
  console.log(`Rehearsal org demo-bank-rehearsal = ${rehearsalOrg} (scratch)`);

  let failed = 0;

  // 1. Health
  try {
    const res = await fetch(`${base}/health`).catch(() => fetch(`${base}/`));
    if (!step("API reachable", res.ok || res.status < 500, `http=${res.status}`))
      failed++;
  } catch (e) {
    step("API reachable", false, String(e));
    failed++;
    process.exit(1);
  }

  // 2. Live scenarios fixture path (all 12)
  {
    const res = await fetch(`${base}/v1/aegis/demo/scenarios/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key2}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ approvals: "fixture" }),
    });
    const body = await res.json();
    const ok = res.ok && (body.failed ?? 1) === 0;
    if (
      !step(
        "scenario:live fixture (1–12)",
        ok,
        `failed=${body.failed ?? "?"} http=${res.status}`,
      )
    )
      failed++;
  }

  // 3. HTTP approvals 2–7, 5, 9–12
  {
    const res = await fetch(`${base}/v1/aegis/demo/scenarios/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key2}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: [2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
        approvals: "http",
      }),
    });
    const body = await res.json();
    for (const r of body.results ?? []) {
      if (
        !step(
          `HTTP scenario ${r.id} ${r.name}`,
          r.ok,
          `${r.receipt_kind ?? ""} ${r.detail ?? ""}`.slice(0, 160),
        )
      )
        failed++;
    }
    if (!res.ok) {
      step("HTTP approvals batch", false, `http=${res.status}`);
      failed++;
    }
  }

  // 4. Export + verify + tamper
  {
    const child = spawn(
      "pnpm",
      ["--filter", "aegis-api", "export:scenario-bundles"],
      {
        cwd: root,
        shell: true,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    const code = await new Promise((resolve) => child.on("exit", resolve));
    const ok =
      code === 0 &&
      /verify .*PASS/.test(out) &&
      /FAIL \(expected\)/.test(out);
    if (!step("export bundles + verify + tamper", ok, `exit=${code}`)) {
      console.log(out.slice(0, 1200));
      failed++;
    }
  }

  console.log(`\nrehearse done — failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
