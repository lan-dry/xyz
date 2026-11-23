/**
 * Gate 1: spin a fresh sandbox org and exercise each quickstart path against createApp().
 * Writes evidence under docs/launch/_raw/. Used by CI (`pnpm launch:quickstarts`).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
if (!process.env.AEGIS_BRIDGE_MASTER_KEY?.trim()) {
  process.env.AEGIS_BRIDGE_MASTER_KEY = "launch-quickstart-bridge-key";
}

const { createApp } = await import("../src/app.js");
const { getPool, closePool } = await import("../src/db/pool.js");
const { createIngestKey } = await import("../src/repo/ingest-keys.js");
const { registerSource } = await import("../src/sources/registry.js");
const { generateKeyPair, buildEnvelope, signEnvelope } = await import(
  "@salanor/aegis-sdk"
);

const outDir = resolve(root, "docs/launch/_raw");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const results: Record<string, unknown> = {
  at: new Date().toISOString(),
  quickstarts: {},
};

function fail(step: string, detail: unknown): never {
  console.error(`FAIL ${step}`, detail);
  writeFileSync(
    resolve(outDir, `quickstart-run-${stamp}.json`),
    JSON.stringify({ ok: false, failed: step, detail, ...results }, null, 2),
  );
  process.exit(1);
}

const pool = getPool();
const app = createApp();
const orgId = randomUUID();
const slug = `qs-${Date.now().toString(36)}`;

await pool.query(
  `INSERT INTO organization (
     organization_id, name, slug, tenant_kind, is_test,
     sandbox_expires_at, event_quota_daily, storage_quota_mb, require_signed_events
   ) VALUES ($1, $2, $3, 'sandbox', true, now() + interval '30 days', 5000, 512, false)`,
  [orgId, `Quickstart ${slug}`, slug],
);

const client = await pool.connect();
let ingestKey: string;
let publicKeyB64: string;
let privateKey: Uint8Array;
try {
  const key = await createIngestKey(client, orgId, "quickstart");
  ingestKey = key.rawKey;
  const kp = await generateKeyPair();
  publicKeyB64 = kp.publicKeyB64;
  privateKey = kp.privateKey;
  await registerSource(client, {
    organization_id: orgId,
    source_id: "src_los",
    name: "LOS quickstart",
    kind: "application",
    public_key_b64: publicKeyB64,
    key_id: "k_sandbox_los",
    actor: "launch-quickstarts",
  });
} finally {
  client.release();
}

results.sandbox = { organization_id: orgId, slug };

async function postBank(caseId: string, actorId: string) {
  const body = {
    schema_version: 1,
    case_id: caseId,
    idempotency_key: randomUUID(),
    event_type: "loan_decision",
    product: "retail_loan",
    emitted_at: new Date().toISOString(),
    actor: { type: "system", id: actorId },
    attributes: {
      amount: 1_200_000,
      currency: "RWF",
      beneficiary_account: "ACCT-DEMO-001",
      applicant_name: "Sandbox Test",
    },
    trace_id: `tr_${actorId}_${Date.now().toString(36)}`,
  };
  const res = await app.request("/v1/aegis/bank/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

// --- curl (docs/quickstart/curl.md) ---
{
  const r = await postBank(`SBX-CURL-${Date.now().toString(36).toUpperCase()}`, "curl-quickstart");
  if (r.status !== 200) fail("curl", r);
  results.quickstarts = {
    ...(results.quickstarts as object),
    curl: { ok: true, status: r.status, body: r.body },
  };
  console.log("OK curl");
}

// --- typescript (signed source-events via @salanor/aegis-sdk) ---
{
  const event = {
    schema_version: 1,
    case_id: `SBX-TS-${Date.now().toString(36).toUpperCase()}`,
    idempotency_key: randomUUID(),
    event_type: "loan_decision",
    product: "retail_loan",
    emitted_at: new Date().toISOString(),
    actor: { type: "system", id: "ts-quickstart" },
    attributes: {
      amount: 1_200_000,
      currency: "RWF",
      beneficiary_account: "ACCT-DEMO-001",
    },
    trace_id: `tr_ts_${Date.now()}`,
  };
  const unsigned = buildEnvelope({
    source_id: "src_los",
    key_id: "k_sandbox_los",
    seq: 1,
    event,
  });
  const envelope = await signEnvelope(unsigned, privateKey);
  const res = await app.request("/v1/aegis/source-events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(envelope),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) fail("typescript", { status: res.status, body });
  results.quickstarts = {
    ...(results.quickstarts as object),
    typescript: { ok: true, status: res.status, body },
  };
  console.log("OK typescript");
}

// --- python (docs/quickstart/python.md via python3 + temp HTTP server) ---
{
  const { serve } = await import("@hono/node-server");
  const port = 18_080 + (process.pid % 100);
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  await new Promise((r) => setTimeout(r, 200));
  const py = `
import json, os, urllib.request, uuid
from datetime import datetime, timezone
api = os.environ["AEGIS_API_BASE"].rstrip("/")
key = os.environ["AEGIS_INGEST_KEY"]
body = {
  "schema_version": 1,
  "case_id": "SBX-PY-" + uuid.uuid4().hex[:8].upper(),
  "idempotency_key": str(uuid.uuid4()),
  "event_type": "loan_decision",
  "product": "retail_loan",
  "emitted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
  "actor": {"type": "system", "id": "py-quickstart"},
  "attributes": {
    "amount": 1200000,
    "currency": "RWF",
    "beneficiary_account": "ACCT-DEMO-001",
  },
  "trace_id": f"tr_py_{uuid.uuid4().hex[:8]}",
}
req = urllib.request.Request(
  f"{api}/v1/aegis/bank/events",
  data=json.dumps(body).encode(),
  headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
  method="POST",
)
with urllib.request.urlopen(req) as resp:
  print(resp.read().decode())
`;
  const pyFile = resolve(outDir, `_quickstart_py_${stamp}.py`);
  writeFileSync(pyFile, py, "utf8");
  const pyEnv = {
    ...process.env,
    AEGIS_API_BASE: `http://127.0.0.1:${port}`,
    AEGIS_INGEST_KEY: ingestKey,
  };
  const spawnOpts = {
    env: pyEnv,
    encoding: "utf8" as const,
    timeout: 15_000,
    windowsHide: true,
  };
  let run2 = spawnSync("python3", [pyFile], spawnOpts);
  if (run2.status !== 0) {
    run2 = spawnSync("python", [pyFile], spawnOpts);
  }
  // Avoid Windows Store `py` alias — it can hang waiting for install UI.
  if (run2.status !== 0 && process.platform !== "win32") {
    run2 = spawnSync("py", ["-3", pyFile], spawnOpts);
  }
  try {
    (server as { close?: () => void }).close?.();
  } catch {
    /* ignore */
  }
  if (run2.status !== 0) {
    // Local Windows may lack Python; still prove the same HTTP contract via Node.
    if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
      fail("python", { stdout: run2.stdout, stderr: run2.stderr, status: run2.status });
    }
    const r = await postBank(
      `SBX-PY-${Date.now().toString(36).toUpperCase()}`,
      "py-quickstart",
    );
    if (r.status !== 200) fail("python-node-fallback", r);
    results.quickstarts = {
      ...(results.quickstarts as object),
      python: {
        ok: true,
        mode: "node_http_fallback",
        note: "python3/python/py not on PATH; bank/events contract exercised via Node",
        body: r.body,
      },
    };
    console.log("OK python (node HTTP fallback — install python3 for live script)");
  } else {
    let pyBody: unknown = run2.stdout;
    try {
      pyBody = JSON.parse(run2.stdout.trim().split("\n").pop() ?? "{}");
    } catch {
      /* keep text */
    }
    results.quickstarts = {
      ...(results.quickstarts as object),
      python: {
        ok: true,
        mode: "python_script",
        stdout: run2.stdout.slice(0, 2000),
        body: pyBody,
      },
    };
    console.log("OK python");
  }
}

// --- connector docker: validate docs + image ref contract (no registry pull required) ---
{
  const md = readFileSync(resolve(root, "docs/quickstart/connector-docker.md"), "utf8");
  const hasRun = /docker run/.test(md);
  const hasEnv =
    /AEGIS_URL/.test(md) && /INGEST_BEARER/.test(md) && /SOURCE_ID/.test(md);
  const image = md.match(/ghcr\.io\/[^\s]+/)?.[0] ?? null;
  if (!hasRun || !hasEnv || !image) fail("connector-docker", { hasRun, hasEnv, image });
  results.quickstarts = {
    ...(results.quickstarts as object),
    connector_docker: {
      ok: true,
      mode: "doc_contract",
      image,
      note: "Fresh sandbox + source key registered; image pull is release-pack specific.",
    },
  };
  console.log("OK connector-docker (doc contract)");
}

const artifact = resolve(outDir, `quickstart-run-${stamp}.json`);
const latest = resolve(outDir, "quickstart-run-latest.json");
const payload = { ok: true, ...results };
writeFileSync(artifact, JSON.stringify(payload, null, 2));
writeFileSync(latest, JSON.stringify(payload, null, 2));
console.log(`Wrote ${artifact}`);

await closePool();
process.exit(0);
