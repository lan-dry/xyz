#!/usr/bin/env node
/**
 * Headless 20-minute demo sequence against a running API (docs/DEMO.md).
 * Prints PASS/FAIL per step. Requires AEGIS_DEMO_MODE on the server,
 * AEGIS_INGEST_KEY / AEGIS_DEMO_APPROVAL_PASSWORD locally.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

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

function step(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  loadDotEnv();
  process.env.AEGIS_DEMO_MODE = process.env.AEGIS_DEMO_MODE || "true";
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
  process.env.AEGIS_INGEST_KEY = key;
  process.env.AEGIS_API_BASE = base;

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
        Authorization: `Bearer ${key}`,
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
        Authorization: `Bearer ${key}`,
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
