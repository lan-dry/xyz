#!/usr/bin/env node
/**
 * Real-timer escalation proof (demo tenant 2-minute window).
 * Creates a held approval via the standalone simulator, waits the real window,
 * then triggers expire+escalate via the console approvals list and prints the
 * approval metadata / linked receipt evidence.
 *
 * Needs: API + ID + console session, BANK_SIMULATOR_URL, AEGIS_DEMO_APPROVAL_PASSWORD
 * Does NOT use the demo clock.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const password = process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim();
if (!password || password.length < 10) {
  console.error("Set AEGIS_DEMO_APPROVAL_PASSWORD");
  process.exit(1);
}
const consoleOrigin = (process.env.CONSOLE_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
const apiBase = (
  process.env.AEGIS_API_URL ||
  process.env.AEGIS_API_BASE ||
  "http://127.0.0.1:8088"
).replace(/\/+$/, "");
const simUrl = (process.env.BANK_SIMULATOR_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const simPass = process.env.BANK_SIMULATOR_PASS?.trim() || "";
const waitMs = Number(process.env.ESCALATION_WAIT_MS || 2 * 60_000 + 15_000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login() {
  const jar = new Map();
  const remember = (res) => {
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const idHost = (
    process.env.SALANOR_ID_URL ||
    process.env.CORS_ID_HOST ||
    "http://127.0.0.1:8091"
  ).replace(/\/+$/, "");
  const res = await fetch(`${idHost}/v1/id/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.test", password }),
    redirect: "manual",
  });
  remember(res);
  if (!res.ok && res.status !== 302) {
    throw new Error(`login HTTP ${res.status}`);
  }
  return cookie();
}

async function simStory(storyId) {
  const headers = { "Content-Type": "application/json", "X-Simulator": "1" };
  let cookie = "";
  const probe = await fetch(`${simUrl}/api/state`, { headers: { "X-Simulator": "1" } });
  if (probe.status !== 200) {
    if (!simPass) throw new Error("Simulator requires BANK_SIMULATOR_PASS");
    const loginRes = await fetch(`${simUrl}/api/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ passphrase: simPass }),
    });
    cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    if (!loginRes.ok) throw new Error(`sim login ${loginRes.status}`);
  }
  const res = await fetch(`${simUrl}/api/story`, {
    method: "POST",
    headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ story_id: storyId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`story HTTP ${res.status} ${body.error ?? ""}`);
  return body;
}

const cookie = await login();
console.log("== prove-escalation-2min ==");
console.log(`wait_ms=${waitMs} (real elapsed time, not demo clock)`);

const story = await simStory("loan_needs_manager");
console.log(
  `held story outcome=${story.outcome} approval_id=${story.approval_id} case=${story.case_id ?? story.trace_id}`,
);
if (!story.approval_id) {
  console.error("No approval_id from held story");
  process.exit(1);
}

const started = Date.now();
console.log(`sleeping until escalation window elapses…`);
await sleep(waitMs);
console.log(`slept ${Date.now() - started}ms`);

const list = await fetch(`${apiBase}/v1/console/approvals?status=pending`, {
  headers: { Cookie: cookie },
});
const listBody = await list.json().catch(() => ({}));
console.log(`approvals list HTTP ${list.status}`);

const detail = await fetch(
  `${apiBase}/v1/console/approvals/${encodeURIComponent(story.approval_id)}`,
  { headers: { Cookie: cookie } },
);
const d = await detail.json().catch(() => ({}));
const meta = d.approval?.metadata ?? d.metadata ?? {};
const escalatedAt = meta.escalated_to_role_at ?? meta.escalated_at ?? null;
const toRole = meta.escalate_to_role ?? meta.escalated_to_role ?? null;
const afterMs = meta.escalate_after_ms;

console.log(
  JSON.stringify(
    {
      approval_id: story.approval_id,
      status: d.approval?.status ?? d.status,
      escalate_after_ms: afterMs,
      escalate_to_role: toRole,
      escalated_to_role_at: escalatedAt,
      escalated_reason: meta.escalated_reason ?? null,
      receipt_id: d.approval?.receipt_id ?? d.receipt_id ?? story.receipt_id ?? null,
      list_count: Array.isArray(listBody.approvals) ? listBody.approvals.length : undefined,
    },
    null,
    2,
  ),
);

if (!escalatedAt) {
  console.error("FAIL: approval was not escalated after the real 2-minute window");
  process.exit(1);
}
console.log("PASS: real-timer escalation recorded");
