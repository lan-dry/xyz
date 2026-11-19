#!/usr/bin/env node
/**
 * Standalone bank simulator (http://127.0.0.1:4000).
 *
 * Plays the part of a bank's core system for the hosted Demo Bank tenant: story buttons
 * send governed events to the real intake, holds are requested through the real approvals
 * endpoint, and every case links to the console. "Aegis unreachable" runs the SDK's
 * wrapFetch fail-open buffer, queues the bank's decision locally, and replays it when the
 * link is back (the receipt is then marked "decided without Aegis").
 *
 * Environment (defaults; the Setup section on the page can override and persist them):
 *   AEGIS_API_BASE         e.g. https://api.salanor.com
 *   AEGIS_INGEST_KEY       printed once by pnpm pilot:provision-demo-tenant
 *   AEGIS_ORGANIZATION_ID  needed to also raise approval requests for holds
 *   AEGIS_ORGANIZATION_NAME optional display name for the status line (default "Demo Bank")
 *   AEGIS_AGENT_ID         agent shown in the status line and sent as the event actor
 *   AEGIS_CONSOLE_ORIGIN   optional, default https://app.salanor.com (case links)
 *   PORT / HOST            default 4000 / 127.0.0.1
 *   AEGIS_KEY_ID, AEGIS_AGENT_PRIVATE_KEY_B64
 *                          optional; only to drain the SDK's signed-event buffer after an outage
 *
 * The server may boot without an API base / key (Setup supplies them); story runs are refused
 * until it is configured.
 *
 * Access control (same code locally and deployed):
 *   BANK_SIMULATOR_PASS    shared passphrase (min 12 chars). Unset = loopback-only, no login (local use).
 *                          Set = login page, rate-limited, signed session cookie; may listen on 0.0.0.0.
 *   BANK_SIMULATOR_SESSION_SECRET  optional HMAC key for the session cookie. Default: random per process
 *                          (sessions end on restart; run one instance).
 *   BANK_SIMULATOR_SESSION_HOURS   default 8
 *   BANK_SIMULATOR_TRUST_PROXY     "1" to take the client IP from X-Forwarded-For (set on Railway)
 *   BANK_SIMULATOR_ALLOWED_HOSTS   optional comma list of Host values accepted when a passphrase is set
 *
 * The ingest key stays on this server. It is never sent to the browser. A key supplied only by
 * the environment is never written to disk; a key saved through Setup is stored in
 * DATA_DIR/config.json (mode 0600) because the server needs the plaintext to call the API.
 * Every JSON response is also scrubbed of the raw key as a last line of defence.
 * The passphrase and session secret are never logged or returned.
 * Locally, pnpm demo:up provisions Demo Bank on a normal local API; point this simulator at it.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STORIES, getStory } from "./stories.mjs";
import { SYSTEMS } from "./systems.mjs";
import { SimulatedConnectors } from "./connectors-sim.mjs";
import { RealConnectors } from "./real-connectors.mjs";
import { CoreLedger } from "./core-ledger.mjs";
import { ATTACKS, HONEST_LIMIT, runAttack } from "./redteam-attacks.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));

const ENV_CONFIG = {
  apiBase: (process.env.AEGIS_API_BASE ?? "").trim().replace(/\/+$/, ""),
  ingestKey: (process.env.AEGIS_INGEST_KEY ?? "").trim(),
  orgId: (process.env.AEGIS_ORGANIZATION_ID ?? process.env.AEGIS_ORG_ID ?? "").trim(),
  orgName: (process.env.AEGIS_ORGANIZATION_NAME ?? "").trim(),
  agentId: (process.env.AEGIS_AGENT_ID ?? "").trim(),
};
const CONSOLE_ORIGIN = (process.env.AEGIS_CONSOLE_ORIGIN ?? "https://app.salanor.com")
  .trim()
  .replace(/\/+$/, "");
const PORT = Number(process.env.PORT ?? 4000);
const PASSPHRASE = (process.env.BANK_SIMULATOR_PASS ?? "").trim();
const AUTH_ENABLED = PASSPHRASE.length > 0;
const SESSION_HOURS = Math.max(Number(process.env.BANK_SIMULATOR_SESSION_HOURS ?? 8) || 8, 0.1);
const TRUST_PROXY = process.env.BANK_SIMULATOR_TRUST_PROXY === "1";
const ALLOWED_HOSTS = (process.env.BANK_SIMULATOR_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const SESSION_SECRET =
  process.env.BANK_SIMULATOR_SESSION_SECRET?.trim() || randomBytes(32).toString("hex");
const SESSION_COOKIE = "bank_sim_session";
// Deployed (platform sets PORT) with a passphrase: listen on all interfaces. Otherwise loopback only.
const HOST =
  process.env.HOST?.trim() || (AUTH_ENABLED && process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const DATA_DIR = resolve(process.env.BANK_SIMULATOR_DATA_DIR?.trim() || ".bank-simulator");
const QUEUE_FILE = join(DATA_DIR, "queue.json");
process.env.AEGIS_SIGNED_BUFFER_DIR ||= join(DATA_DIR, "sdk-buffer");

const CONFIG_FILE = join(DATA_DIR, "config.json");

/** In-memory core ledger: money only moves after Aegis execution/permit. */
const ledger = [];
const refusedDisbursements = [];
/** case_id → action snapshot queued for disburse after approve */
const pendingDisburse = new Map();

/** Red-team crash/outbox sims (not used for live signed ingest). */
const simConnectors = new SimulatedConnectors(join(DATA_DIR, "connectors-sim"), {
  apiBase: ENV_CONFIG.apiBase,
  ingestKey: ENV_CONFIG.ingestKey,
});
/** Real in-process Aegis Connectors (Stage 1b) — signs via @salanor/aegis-connector. */
const realConnectors = new RealConnectors(DATA_DIR, {
  apiBase: ENV_CONFIG.apiBase,
  ingestKey: ENV_CONFIG.ingestKey,
  // Keep seq/outbox under the simulator data dir so demo:connectors can own
  // `.data/connectors/*/state` (separate Connector processes + registered keys).
  localStateOnly: true,
});
/** Alias kept for redteam-attacks.mjs which expects `connectors`. */
const connectors = simConnectors;
const coreLedger = new CoreLedger({
  databaseUrl: process.env.BANK_CORE_DATABASE_URL ?? "",
  dataDir: join(DATA_DIR, "ledger"),
  permitFn: async (caseId, action) => askExecutionPermit(caseId, action, null),
  confirmFn: async ({ token, params }) => {
    const c = cfg();
    if (!c.configured) return { ok: false, code: "not_configured", reason: "Not configured" };
    // Prefer Core Connector confirm (source-signs params) when keys are ready.
    try {
      const core = await realConnectors.get("core");
      if (core) {
        // Use the Connector HTTP confirm path via submit isn't available; post through
        // the in-process connector's confirm by calling Aegis with a signed envelope
        // from POST /execute/confirm semantics — fall through to direct confirm below
        // unless we open listen. Direct confirm still works; Core signing is Partial
        // unless demo:connectors is up. Loan stories use LOS Connector for G1.
      }
    } catch {
      /* fall through */
    }
    const res = await postJson("/v1/aegis/executions/confirm", { token, params }, {}, {});
    if (res.status === 200 && res.data?.ok !== false && !res.data?.error) {
      return { ok: true, ...res.data };
    }
    return {
      ok: false,
      code: res.data?.code ?? "confirm_failed",
      reason: res.data?.reason ?? res.data?.error ?? `HTTP ${res.status}`,
      ...res.data,
    };
  },
});
await simConnectors.init();
await realConnectors.init();
await coreLedger.init();
// Refresh connector cfg when setup changes — see saveConfig.

function publicBaseUrl() {
  const host = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  return `http://${host}:${PORT}`;
}

// ---------------------------------------------------------------- config (env defaults + saved override)

/** Fields saved through Setup. Overrides the environment per field. May hold the plaintext key. */
let saved = {};

async function loadSaved() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
    saved = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    saved = {};
  }
}

async function persistSaved() {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(saved, null, 2), { encoding: "utf8", mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => {});
  await rename(tmp, CONFIG_FILE);
}

/** The effective configuration. The key is only ever read by server-side code, never serialised. */
function cfg() {
  const pick = (k) => (typeof saved[k] === "string" && saved[k] ? saved[k] : ENV_CONFIG[k]);
  const apiBase = pick("apiBase");
  const ingestKey = pick("ingestKey");
  const orgId = pick("orgId");
  const agentId = pick("agentId");
  const fromSetup = Object.keys(saved).some((k) => typeof saved[k] === "string" && saved[k]);
  return {
    apiBase,
    ingestKey,
    orgId,
    agentId,
    orgLabel: fromSetup ? orgId : ENV_CONFIG.orgName || orgId || "Demo Bank",
    configured: Boolean(apiBase && ingestKey),
    source: fromSetup ? "setup" : apiBase || ingestKey ? "env" : "none",
  };
}

/** Browser-safe view of the configuration. Never contains the key. */
function publicConfig() {
  const c = cfg();
  return {
    configured: c.configured,
    apiBase: c.apiBase,
    orgId: c.orgId,
    orgLabel: c.orgLabel,
    agentId: c.agentId,
    keyPresent: Boolean(c.ingestKey),
    keyHint: maskKey(c.ingestKey),
    source: c.source,
    status_line: c.configured
      ? `Connected to ${c.orgLabel || "unknown organisation"} \u00b7 ${c.agentId || "no agent set"}`
      : "Not connected \u00b7 open Setup to add the API base and ingest key",
  };
}

/** `aegis_<hex>` -> `aegis_…****`. Reveals at most a short type prefix. */
function maskKey(key) {
  if (!key) return "";
  const m = /^[A-Za-z]{1,8}_/.exec(key);
  return `${m ? m[0] : ""}\u2026****`;
}

/** Replace every raw occurrence of the key (plain or JSON-escaped) in a string. */
function scrub(text) {
  const key = cfg().ingestKey;
  if (!key || key.length < 6 || typeof text !== "string") return text;
  const masked = maskKey(key);
  let out = text.split(key).join(masked);
  const escaped = JSON.stringify(key).slice(1, -1);
  if (escaped !== key) out = out.split(escaped).join(masked);
  return out;
}

function scrubJson(value) {
  return JSON.parse(scrub(JSON.stringify(value)));
}

function notConfiguredError() {
  return {
    status: 409,
    body: { error: "Not configured. Open Setup and save the API base and ingest key first.", configured: false },
  };
}

await loadSaved();

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (AUTH_ENABLED && PASSPHRASE.length < 12) {
  console.error("\n  BANK_SIMULATOR_PASS must be at least 12 characters.\n");
  process.exit(1);
}
if (!AUTH_ENABLED && !LOOPBACK_HOSTS.has(HOST)) {
  console.error(
    "\n  Refusing to listen on a non-loopback address without a passphrase.\n" +
      "  Set BANK_SIMULATOR_PASS (min 12 chars), or unset HOST to stay on 127.0.0.1.\n",
  );
  process.exit(1);
}

/** Simulated link state (a toggle on the page, not a real network change). */
let offline = false;

// ---------------------------------------------------------------- SDK (lazy)

let sdkPromise;
function loadSdk() {
  sdkPromise ??= (async () => {
    try {
      return await import("@salanor/aegis");
    } catch {
      const fallback = resolve(here, "../../sdks/typescript/dist/index.js");
      if (existsSync(fallback)) return import(pathToFileURL(fallback).href);
      return null;
    }
  })();
  return sdkPromise;
}

function sdkSignOptions() {
  const privateKeyB64 = process.env.AEGIS_AGENT_PRIVATE_KEY_B64?.trim();
  const keyId = process.env.AEGIS_KEY_ID?.trim();
  return privateKeyB64 && keyId ? { privateKeyB64, keyId } : null;
}

async function sdkBufferCount() {
  try {
    const files = await readdir(process.env.AEGIS_SIGNED_BUFFER_DIR);
    return files.filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

/**
 * Run the SDK's real wrapFetch while "Aegis is unreachable": policy evaluation fails, the
 * bank proceeds under its own fallback (proceed_and_flag) and the SDK queues the decision
 * in its local buffer. Returns whether the SDK buffered it.
 */
async function runSdkFallback(story, traceId) {
  const sdk = await loadSdk();
  if (!sdk?.wrapFetch) return { buffered: false, note: "SDK not built (pnpm --filter @salanor/aegis build)" };
  const c = cfg();
  const unreachable = async (input) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.startsWith(c.apiBase)) throw new TypeError("fetch failed (simulated link loss)");
    // The bank's own downstream call (e.g. its core ledger) still works.
    return new Response(JSON.stringify({ ok: true, simulated: true }), { status: 200 });
  };
  try {
    await sdk.wrapFetch(
      "https://core-banking.bank.invalid/loans/disburse",
      { method: "POST", body: JSON.stringify({ story: story.id }) },
      {
        context: {
          organizationId: c.orgId || "unknown",
          agentId: c.agentId || story.agent_slug,
          keyId: process.env.AEGIS_KEY_ID?.trim() || "unconfigured",
          traceId,
          toolName: "governed.action",
          policyPayload: story.attributes,
        },
        sign: sdkSignOptions() ?? { privateKeyB64: "unconfigured", keyId: "unconfigured" },
        ingest: { apiBaseUrl: c.apiBase, ingestApiKey: c.ingestKey },
        onUnreachable: "proceed_and_flag",
        fetchImpl: unreachable,
        ingestFn: async () => {
          throw new Error("Aegis unreachable (simulated)");
        },
      },
    );
  } catch {
    // Expected: the result event cannot be recorded while offline. The decision is buffered.
  }
  return { buffered: (await sdkBufferCount()) > 0, note: null };
}

// ---------------------------------------------------------------- queue (bank-side)

async function readQueue() {
  try {
    return JSON.parse(await readFile(QUEUE_FILE, "utf8"));
  } catch {
    return [];
  }
}
async function writeQueue(items) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(QUEUE_FILE, JSON.stringify(items, null, 2), "utf8");
}

// ---------------------------------------------------------------- Aegis calls

/**
 * POST JSON to the Aegis API with the saved key (or `keyOverride`, used by the wrong-key story).
 * When `calls` is given, a "what was sent" record is appended: endpoint, headers with the key
 * masked, payload, response status and body. The record is built from scrubbed copies.
 */
async function postJson(path, body, extraHeaders = {}, { calls, keyOverride } = {}) {
  const c = cfg();
  const key = keyOverride ?? c.ingestKey;
  const url = `${c.apiBase}${path}`;
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  let status = 0;
  let data = null;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    status = res.status;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text.slice(0, 200) };
    }
  } catch (err) {
    data = { error: `request failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (calls) {
    const masked = { ...headers, Authorization: `Bearer ${maskKey(key)}` };
    calls.push(
      scrubJson({
        method: "POST",
        endpoint: url,
        headers: masked,
        payload: body,
        response: { status, body: data },
      }),
    );
  }
  return { status, data };
}

/** AEGIS-SRC1 rejects floats; turn non-integer numbers into decimal strings. */
function forSigning(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(forSigning);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = forSigning(v);
    return out;
  }
  return value;
}

function buildEvent(story, { decidedWithoutAegis, queuedAt } = {}) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const caseId = `SIM-${suffix.toUpperCase()}`;
  const traceId = `tr_sim_${suffix}`;
  // AEGIS-SRC1 requires a UUID idempotency_key (envelope + event must match).
  const idem = randomUUID();
  return {
    caseId,
    traceId,
    body: {
      schema_version: 1,
      case_id: caseId,
      idempotency_key: idem,
      event_type: story.event_type,
      product: story.product,
      emitted_at: queuedAt ?? new Date().toISOString(),
      actor: { type: "system", id: cfg().agentId || story.agent_slug },
      attributes: forSigning({
        ...story.attributes,
        ...(decidedWithoutAegis
          ? { decided_without_aegis: true, queued_at: queuedAt, bank_fallback: "proceed_and_flag" }
          : {}),
      }),
      trace_id: traceId,
    },
  };
}

/**
 * Ask Aegis whether the core ledger may pay. This is the in-path gate:
 * without a sealed allow/approve matching the action, disbursement is refused.
 */
async function askExecutionPermit(caseId, action, calls) {
  return postJson(
    "/v1/aegis/execution/permit",
    { case_id: caseId, action },
    {},
    { calls },
  );
}

function actionFromAttributes(attrs) {
  const a = attrs && typeof attrs === "object" ? attrs : {};
  const out = {};
  for (const key of [
    "amount",
    "amount_usd",
    "currency",
    "beneficiary",
    "expected_beneficiary",
    "merchant_id",
    "order_id",
    "customer_email",
  ]) {
    if (a[key] != null && a[key] !== "") out[key] = a[key];
  }
  return out;
}

/**
 * Core ledger disburse. Always requires Aegis execution/permit unless the caller
 * explicitly tries the "skip Aegis" demo path — which the ledger still refuses.
 */
async function coreDisburse(input, { calls } = {}) {
  const caseId = String(input.case_id ?? "").trim();
  const action = actionFromAttributes(input.action ?? input);
  if (!caseId) {
    return { status: 422, body: { error: "case_id required", permitted: false } };
  }
  if (input.skip_aegis === true) {
    const row = {
      at: new Date().toISOString(),
      case_id: caseId,
      action,
      reason: "Core ledger refuses ungated disbursement (skip_aegis attempted)",
      code: "permit_required",
    };
    refusedDisbursements.unshift(row);
    if (refusedDisbursements.length > 100) refusedDisbursements.length = 100;
    return {
      status: 403,
      body: {
        ok: false,
        permitted: false,
        code: "permit_required",
        error: row.reason,
        case_id: caseId,
      },
    };
  }

  const permit = await askExecutionPermit(caseId, action, calls);
  if (permit.status !== 200 || !permit.data?.permitted) {
    const row = {
      at: new Date().toISOString(),
      case_id: caseId,
      action,
      reason: permit.data?.reason ?? `permit HTTP ${permit.status}`,
      code: permit.data?.code ?? "denied",
      permit: permit.data ?? null,
    };
    refusedDisbursements.unshift(row);
    if (refusedDisbursements.length > 100) refusedDisbursements.length = 100;
    return {
      status: 403,
      body: {
        ok: false,
        permitted: false,
        ...(permit.data && typeof permit.data === "object" ? permit.data : {}),
        error: row.reason,
      },
    };
  }

  const entry = {
    id: `pay_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    at: new Date().toISOString(),
    case_id: caseId,
    action,
    receipt_id: permit.data.receipt_id ?? null,
    receipt_hash: permit.data.receipt_hash ?? null,
    outcome: permit.data.outcome ?? null,
  };
  ledger.unshift(entry);
  if (ledger.length > 100) ledger.length = 100;
  pendingDisburse.delete(caseId);
  // Mirror into Stage-8 core ledger (Postgres or memory) for feeds / red team.
  try {
    await coreLedger.postTxn({
      case_id: caseId,
      account_id: String(action.beneficiary_account ?? action.account_id ?? "ACCT-DEMO-001"),
      amount: Number(action.amount ?? 0),
      currency: String(action.currency ?? "RWF"),
      token_id: permit.data?.token_id ?? null,
      meta: { via: "permit", receipt_id: entry.receipt_id },
    });
    await connectors.recordSend("core");
  } catch (err) {
    console.warn("[bank-simulator] core ledger mirror failed:", err instanceof Error ? err.message : err);
  }
  return { status: 200, body: { ok: true, permitted: true, entry, permit: permit.data } };
}

/**
 * Send one event through the LOS Aegis Connector (signed AEGIS-SRC1 → source-events),
 * then raise an approval request for a hold or a hard stop.
 */
async function submit(body, steps, calls) {
  const orgId = cfg().orgId;
  const c = cfg();
  realConnectors.cfg = { apiBase: c.apiBase, ingestKey: c.ingestKey };
  let intake;
  try {
    intake = await realConnectors.submit("los", body, { calls });
    steps.push("LOS Connector → signed source-events (G1).");
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : `Connector submit failed: ${String(err)}`,
    );
  }
  if (intake.status !== 200) {
    throw new Error(intake.data?.message ?? intake.data?.error ?? `intake returned ${intake.status}`);
  }
  const decision = intake.data;
  if (!decision || typeof decision !== "object") {
    throw new Error("Connector delivered but Aegis response body was empty");
  }
  steps.push(
    `Governed intake: ${decision.outcome}${decision.source_signed || decision.evidence_grade === "G1" ? " (source-signed)" : ""}`,
  );
  const sealed = Boolean(decision.event_id) && !String(decision.event_id).startsWith("evt_gov_");
  let approvalId = null;
  const action = actionFromAttributes(body.attributes);
  if (decision.outcome === "allow" && sealed) {
    pendingDisburse.set(body.case_id, {
      action,
      trace_id: body.trace_id,
      outcome: "allow",
    });
    steps.push("Auto-allowed: core ledger may disburse after Aegis execution/permit.");
  }
  if ((decision.outcome === "hold" || decision.outcome === "stop") && sealed) {
    pendingDisburse.set(body.case_id, {
      action,
      trace_id: body.trace_id,
      outcome: decision.outcome,
    });
    if (!orgId) {
      steps.push("Approval not raised: set the organisation id in Setup to also create the approval request.");
    } else {
      const resumeUrl = `${publicBaseUrl()}/core/loans/disburse-resume`;
      const req = await postJson(
        "/v1/aegis/approvals/request",
        {
          organization_id: orgId,
          event_id: decision.event_id,
          trace_id: body.trace_id,
          tool_name: "governed.action",
          deferred: { url: resumeUrl, method: "POST" },
        },
        {},
        { calls },
      );
      if (req.status < 300 && req.data?.approval_id) {
        approvalId = req.data.approval_id;
        const pending = pendingDisburse.get(body.case_id);
        if (pending) pending.approval_id = approvalId;
        steps.push(
          "Approval requested: approve in the console, then disburse via the core ledger (permit gate).",
        );
      } else {
        steps.push(`Approval request failed (${req.status}).`);
      }
    }
  } else if (decision.outcome === "hold" && !sealed) {
    steps.push("Held but not sealed: the API's signing bridge is not configured.");
  }
  return { decision, sealed, approvalId, action };
}

function consoleUrl(traceId) {
  return `${CONSOLE_ORIGIN}/aegis/traces/${encodeURIComponent(traceId)}`;
}

function result(story, caseId, traceId, outcome) {
  return {
    ok: true,
    story_id: story.id,
    expected: story.expect,
    expect_detail: story.expect_detail,
    resolver: story.resolver ?? null,
    case_id: caseId,
    trace_id: traceId,
    outcome,
    console_url: consoleUrl(traceId),
  };
}

/** A key that cannot exist. Used only by the wrong-key story; shown masked like any other key. */
const WRONG_KEY = "aegis_0000000000000000000000000000000000000000deadbeef";

/** The wrong-key story: same kind of event, bad credential. Must be refused with 401 and create no case. */
async function runWrongKeyStory(story) {
  const steps = [];
  const calls = [];
  const built = buildEvent(story);
  const res = await postJson(
    "/v1/aegis/governed/events",
    built.body,
    { "Idempotency-Key": built.body.idempotency_key },
    { calls, keyOverride: WRONG_KEY },
  );
  const rejected = res.status === 401;
  steps.push(
    rejected
      ? "Aegis refused the key with HTTP 401. Nothing was recorded."
      : `Unexpected: expected HTTP 401, got ${res.status || "no response"}.`,
  );
  return {
    status: 200,
    body: {
      ok: rejected,
      story_id: story.id,
      expected: story.expect,
      expect_detail: story.expect_detail,
      resolver: null,
      case_id: null,
      trace_id: null,
      outcome: rejected ? "rejected (HTTP 401)" : `unexpected (HTTP ${res.status || "none"})`,
      http_status: res.status,
      case_created: !rejected && res.status === 200,
      console_url: null,
      steps,
      requests: calls,
    },
  };
}

async function runStory(storyId) {
  const story = getStory(storyId);
  if (!story) return { status: 404, body: { error: "Unknown story" } };
  if (!cfg().configured) return notConfiguredError();
  if (story.wrong_key) return runWrongKeyStory(story);
  const steps = [];
  const calls = [];

  if (offline) {
    // The bank's own fallback decided; it queues the event for replay.
    const queuedAt = new Date().toISOString();
    const built = buildEvent(story, { decidedWithoutAegis: true, queuedAt });
    const sdk = await runSdkFallback(story, built.traceId);
    steps.push("Aegis unreachable (simulated). The bank proceeded under its own fallback.");
    steps.push(
      sdk.buffered
        ? "SDK wrapFetch buffered the decision locally."
        : `SDK buffer not used${sdk.note ? ` (${sdk.note})` : ""}.`,
    );
    const queue = await readQueue();
    queue.push({ story_id: story.id, ...built, queued_at: queuedAt });
    await writeQueue(queue);
    steps.push(`Queued for replay (${queue.length} waiting). Turn the toggle off to replay.`);
    return {
      status: 200,
      body: {
        ...result(story, built.caseId, built.traceId, "queued"),
        queued: true,
        decided_without_aegis: true,
        steps,
        requests: [],
      },
    };
  }

  const built = buildEvent(story);
  try {
    const { decision, sealed, approvalId, action } = await submit(built.body, steps, calls);
    const targetGrade = story.target_grade ?? null;
    if (targetGrade) steps.push(`Target evidence grade for this story: ${targetGrade}.`);
    return {
      status: 200,
      body: {
        ...result(story, built.caseId, built.traceId, decision.outcome),
        plain_summary: decision.plain_summary ?? null,
        matched_rules: decision.matched_rules ?? [],
        approval_id: approvalId,
        sealed,
        action,
        target_grade: targetGrade,
        can_disburse: decision.outcome === "allow" || decision.outcome === "hold",
        decision_token: decision.decision_token ?? null,
        evidence_grade: decision.evidence_grade ?? null,
        steps,
        requests: calls,
      },
    };
  } catch (err) {
    // Show what was sent even when the API refused it.
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : "Request failed", requests: calls },
    };
  }
}

/** Link restored: replay what the bank queued, flagged as decided without Aegis. */
async function replayQueue() {
  const queue = await readQueue();
  const steps = [];
  const replayed = [];
  const calls = [];
  const remaining = [];
  for (const item of queue) {
    try {
      const body = {
        ...item.body,
        attributes: { ...item.body.attributes, replayed_at: new Date().toISOString() },
      };
      const { decision } = await submit(body, steps, calls);
      replayed.push({
        story_id: item.story_id,
        case_id: item.caseId,
        trace_id: item.traceId,
        outcome: decision.outcome,
        console_url: consoleUrl(item.traceId),
      });
    } catch (err) {
      steps.push(`Replay failed for ${item.caseId}: ${err instanceof Error ? err.message : err}`);
      remaining.push(item);
    }
  }
  await writeQueue(remaining);

  let sdkNote = null;
  const sdk = await loadSdk();
  const sign = sdkSignOptions();
  if (sdk?.drainSignedEventBuffer && sign && (await sdkBufferCount()) > 0) {
    const drained = await sdk.drainSignedEventBuffer({
      sign,
      ingest: { apiBaseUrl: cfg().apiBase, ingestApiKey: cfg().ingestKey },
    });
    sdkNote = `SDK buffer drained: ${drained.drained} sent, ${drained.remaining} left.`;
  } else if ((await sdkBufferCount()) > 0) {
    sdkNote =
      "SDK buffer still holds signed-later events. Set AEGIS_AGENT_ID, AEGIS_KEY_ID and AEGIS_AGENT_PRIVATE_KEY_B64 to drain it.";
  }
  if (sdkNote) steps.push(sdkNote);
  return { replayed, remaining: remaining.length, steps, requests: calls };
}

// ---------------------------------------------------------------- HTTP

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  // Last line of defence: the raw ingest key must never leave this process.
  res.end(scrub(JSON.stringify(body)));
}

function hostAllowed(req) {
  const rawHost = (req.headers.host ?? "").toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(0, rawHost.indexOf("]") + 1) : rawHost.split(":")[0];
  if (process.env.ALLOW_ANY_HOST === "1") return true;
  if (AUTH_ENABLED) {
    // Deployed: the passphrase + SameSite cookie protect the tool. Optionally pin the public host.
    return ALLOWED_HOSTS.length === 0 || ALLOWED_HOSTS.includes(host) || ALLOWED_HOSTS.includes(rawHost);
  }
  // Local, no passphrase: loopback only, so a web page on another origin cannot talk to this
  // tool by DNS rebinding.
  return LOOPBACK_HOSTS.has(host);
}

// ---------------------------------------------------------------- login (passphrase + session cookie)

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket.encrypted);
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function safeEqual(a, b) {
  // Hash both sides so the comparison is constant-time regardless of length.
  const ha = createHmac("sha256", "bank-sim-cmp").update(a).digest();
  const hb = createHmac("sha256", "bank-sim-cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function signSession(expiresAtMs) {
  const nonce = randomBytes(12).toString("hex");
  const body = `${expiresAtMs}.${nonce}`;
  const mac = createHmac("sha256", SESSION_SECRET).update(body).digest("hex");
  return `${body}.${mac}`;
}

function sessionValid(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, mac] = parts;
  const expected = createHmac("sha256", SESSION_SECRET).update(`${exp}.${nonce}`).digest("hex");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return false;
  }
  return Number(exp) > Date.now();
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function isAuthenticated(req) {
  return !AUTH_ENABLED || sessionValid(readCookie(req, SESSION_COOKIE));
}

/** Failed-login limiter: per client IP and overall, in a sliding window. */
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_PER_IP = 5;
const LOGIN_MAX_GLOBAL = 30;
const failedLogins = new Map(); // ip -> timestamps
let failedGlobal = [];

function prune(list, now) {
  return list.filter((t) => now - t < LOGIN_WINDOW_MS);
}

/** Returns seconds to wait when locked, else 0. */
function loginLockedFor(ip, now = Date.now()) {
  const mine = prune(failedLogins.get(ip) ?? [], now);
  failedLogins.set(ip, mine);
  failedGlobal = prune(failedGlobal, now);
  const over = mine.length >= LOGIN_MAX_PER_IP ? mine : failedGlobal.length >= LOGIN_MAX_GLOBAL ? failedGlobal : null;
  return over ? Math.max(Math.ceil((over[0] + LOGIN_WINDOW_MS - now) / 1000), 1) : 0;
}

function recordFailedLogin(ip, now = Date.now()) {
  failedLogins.set(ip, [...prune(failedLogins.get(ip) ?? [], now), now]);
  failedGlobal.push(now);
  if (failedLogins.size > 5000) failedLogins.clear();
}

function sessionCookie(req, token, maxAgeSeconds) {
  const flags = ["Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSeconds}`];
  if (isSecureRequest(req)) flags.push("Secure");
  return `${SESSION_COOKIE}=${token}; ${flags.join("; ")}`;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new Error("body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

/**
 * Setup: validate and persist the connection details. The key is optional when one is already
 * present (leave blank to keep it) unless the API base changes, so a stored key is never
 * re-pointed at a different host without being re-entered. The response never contains the key.
 */
async function saveConfig(body) {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const apiBase = str(body.apiBase).replace(/\/+$/, "");
  const ingestKey = str(body.ingestKey);
  const orgId = str(body.orgId);
  const agentId = str(body.agentId);
  const fail = (error) => ({ status: 400, body: { error, ...publicConfig() } });

  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    return fail("API base must be a full URL, e.g. https://api.salanor.com");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fail("API base must be http(s).");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return fail("API base must be a plain origin: no credentials, query or fragment.");
  }
  if (!orgId) return fail("Organisation id is required.");
  if (!agentId) return fail("Agent id is required.");
  if (orgId.length > 200 || agentId.length > 200 || ingestKey.length > 500) return fail("A value is too long.");

  const current = cfg();
  if (!ingestKey && !current.ingestKey) return fail("Ingest key is required.");
  if (!ingestKey && current.apiBase && current.apiBase !== apiBase) {
    return fail("Enter the ingest key again when you change the API base.");
  }
  if (/\s/.test(ingestKey)) return fail("Ingest key must not contain spaces.");

  const next = { apiBase, orgId, agentId };
  const keep = typeof saved.ingestKey === "string" ? saved.ingestKey : "";
  // Blank key + same base: keep the saved key. A key that only comes from the environment is
  // never copied to disk; it simply stays the fallback.
  if (ingestKey || keep) next.ingestKey = ingestKey || keep;
  saved = next;
  await persistSaved();
  const nextCfg = { apiBase: next.apiBase, ingestKey: next.ingestKey || cfg().ingestKey };
  connectors.cfg = nextCfg;
  realConnectors.cfg = nextCfg;
  // Drop open Connectors so the next submit picks up the new bearer / base.
  await realConnectors.close();
  return { status: 200, body: publicConfig() };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Liveness for the host platform (its probe sends its own Host header). No data, no secrets.
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { status: "ok", service: "bank-simulator" });
    }
    if (!hostAllowed(req)) return sendJson(res, 403, { error: "Forbidden host" });

    if (req.method === "GET" && url.pathname === "/") {
      const html = await readFile(join(here, "page.html"), "utf8");
      const headers = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
      };
      if (isSecureRequest(req)) headers["Strict-Transport-Security"] = "max-age=63072000";
      res.writeHead(200, headers);
      return res.end(scrub(html));
    }

    // Only this page may call the API: a custom header forces a CORS preflight, which we never grant.
    if (url.pathname.startsWith("/api/") && req.method === "POST" && req.headers["x-simulator"] !== "1") {
      return sendJson(res, 403, { error: "Forbidden" });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      if (!AUTH_ENABLED) return sendJson(res, 200, { ok: true, auth: false });
      const ip = clientIp(req);
      const wait = loginLockedFor(ip);
      if (wait > 0) {
        res.setHeader("Retry-After", String(wait));
        return sendJson(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
      }
      const body = await readJson(req);
      const given = typeof body.passphrase === "string" ? body.passphrase : "";
      if (!given || !safeEqual(given, PASSPHRASE)) {
        recordFailedLogin(ip);
        return sendJson(res, 401, { error: "Wrong passphrase." });
      }
      failedLogins.delete(ip);
      const maxAge = Math.round(SESSION_HOURS * 3600);
      res.setHeader("Set-Cookie", sessionCookie(req, signSession(Date.now() + maxAge * 1000), maxAge));
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
      return sendJson(res, 200, { ok: true });
    }

    // Everything below needs a session when a passphrase is configured.
    if (url.pathname.startsWith("/api/") && !isAuthenticated(req)) {
      return sendJson(res, 401, { error: "Login required", login_required: true });
    }

    if (req.method === "GET" && url.pathname === "/api/stories") {
      return sendJson(res, 200, {
        stories: STORIES.map(({ attributes, ...s }) => ({ ...s, attributes })),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, publicConfig());
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const c = publicConfig();
      return sendJson(res, 200, {
        offline,
        queued: (await readQueue()).length,
        sdk_buffered: await sdkBufferCount(),
        configured: c.configured,
        status_line: c.status_line,
        agent_id: c.agentId || null,
        org_label: c.orgLabel || null,
        config_source: c.source,
        api_base: c.apiBase,
        console_origin: CONSOLE_ORIGIN,
        organization_configured: Boolean(c.orgId),
        // Not a secret (it appears in console URLs). Lets smoke:production confirm the tenant.
        organization_id: c.orgId || null,
        sdk_drain_configured: Boolean(sdkSignOptions()),
        auth_enabled: AUTH_ENABLED,
        label: "Simulated core banking system",
        ledger_count: ledger.length,
        refused_count: refusedDisbursements.length,
        core_ledger: coreLedger.status(),
        systems: SYSTEMS.length,
        redteam_attacks: ATTACKS.length,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/systems") {
      const live = { apiBase: cfg().apiBase, ingestKey: cfg().ingestKey };
      connectors.cfg = live;
      realConnectors.cfg = live;
      return sendJson(res, 200, {
        systems: realConnectors.health({
          connected: Boolean(live.apiBase && live.ingestKey),
          apiBase: live.apiBase,
        }),
        core_ledger: coreLedger.status(),
        bureau_url: process.env.DEMO_BUREAU_URL?.trim() || "http://127.0.0.1:4100",
        connectors_dir:
          process.env.AEGIS_CONNECTORS_DIR?.trim() ||
          join(resolve(here, "../.."), ".data", "connectors"),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/redteam") {
      return sendJson(res, 200, { attacks: ATTACKS, honest_limit: HONEST_LIMIT });
    }

    if (req.method === "GET" && url.pathname === "/api/ledger") {
      const coreTxns = await coreLedger.listTransactions(40);
      return sendJson(res, 200, {
        ledger: ledger.slice(0, 40),
        core_transactions: coreTxns,
        refused: refusedDisbursements.slice(0, 40),
        core_refused: coreLedger.refused.slice(0, 40),
        pending: [...pendingDisburse.entries()].map(([case_id, v]) => ({
          case_id,
          ...v,
        })),
        core_ledger: coreLedger.status(),
      });
    }

    // Core ledger paths (in-path gate). Open to loopback deferred callbacks from Aegis.
    if (req.method === "POST" && url.pathname === "/core/loans/disburse") {
      const body = await readJson(req);
      const out = await coreDisburse(body, { calls: [] });
      return sendJson(res, out.status, out.body);
    }
    if (req.method === "POST" && url.pathname === "/core/loans/disburse-resume") {
      const body = await readJson(req);
      const caseId =
        String(body.case_id ?? body.caseId ?? "").trim() ||
        [...pendingDisburse.keys()].at(-1) ||
        "";
      const pending = pendingDisburse.get(caseId);
      const out = await coreDisburse(
        {
          case_id: caseId,
          action: body.action ?? pending?.action ?? {},
        },
        { calls: [] },
      );
      return sendJson(res, out.status, out.body);
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      const body = await readJson(req);

      if (url.pathname === "/api/config") {
        const out = await saveConfig(body);
        return sendJson(res, out.status, out.body);
      }
      if (url.pathname === "/api/config/reset") {
        // Forget the saved override (and its key); fall back to the environment defaults.
        saved = {};
        await rm(CONFIG_FILE, { force: true });
        return sendJson(res, 200, publicConfig());
      }
      if (url.pathname === "/api/story") {
        const out = await runStory(String(body.story_id ?? ""));
        return sendJson(res, out.status, out.body);
      }
      if (url.pathname === "/api/disburse") {
        const out = await coreDisburse(body, { calls: [] });
        return sendJson(res, out.status, out.body);
      }
      if (url.pathname === "/api/disburse/skip-aegis") {
        const out = await coreDisburse({ ...body, skip_aegis: true }, { calls: [] });
        return sendJson(res, out.status, out.body);
      }
      if (url.pathname === "/api/unreachable") {
        const next = body.on === true;
        if (next === offline) return sendJson(res, 200, { offline, queued: (await readQueue()).length });
        if (!cfg().configured) {
          const out = notConfiguredError();
          return sendJson(res, out.status, out.body);
        }
        offline = next;
        if (offline) return sendJson(res, 200, { offline, queued: (await readQueue()).length });
        const replay = await replayQueue();
        return sendJson(res, 200, { offline, ...replay });
      }
      if (url.pathname === "/api/redteam/run") {
        const attackId = body.attack_id ?? body.id ?? body.attack;
        const liveCfg = cfg();
        realConnectors.cfg = {
          apiBase: liveCfg.apiBase,
          ingestKey: liveCfg.ingestKey,
        };
        const out = await runAttack(attackId, {
          core: coreLedger,
          connectors,
          realConnectors,
          postJson,
          cfg,
        });
        const status = out.status && !out.ok ? out.status : 200;
        return sendJson(res, status, out);
      }
      if (url.pathname === "/api/honest-limit") {
        const liveCfg = cfg();
        realConnectors.cfg = {
          apiBase: liveCfg.apiBase,
          ingestKey: liveCfg.ingestKey,
        };
        const out = await runAttack("honest_limit", {
          core: coreLedger,
          connectors,
          realConnectors,
          postJson,
          cfg,
        });
        return sendJson(res, 200, out);
      }
      if (url.pathname === "/api/feed/export") {
        const format = body.format === "csv" ? "csv" : "jsonl";
        const feed = await coreLedger.exportFeed(format);
        return sendJson(res, 200, {
          ok: true,
          format: feed.format,
          path: feed.path,
          rows: feed.rows,
          preview: feed.text.split("\n").slice(0, 5),
        });
      }
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[bank-simulator]", err instanceof Error ? err.message : err);
    return sendJson(res, 500, { error: err instanceof Error ? err.message : "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Simulated core banking system on http://${HOST}:${PORT}`);
  console.log(`  Login:      ${AUTH_ENABLED ? "passphrase required (BANK_SIMULATOR_PASS)" : "none (loopback only)"}`);
  const c = publicConfig();
  console.log(`  Aegis API:  ${c.apiBase || "(not set)"}`);
  console.log(`  Console:    ${CONSOLE_ORIGIN}`);
  console.log(`  Status:     ${c.status_line} [${c.source}]`);
  if (!c.configured) {
    console.log("  Open the page and use Setup to add the API base and ingest key; stories are refused until then.");
  } else if (!c.orgId) {
    console.log("  Note: no organisation id is set, so holds are sent but no approval request is raised.");
  }
  console.log("");
});
