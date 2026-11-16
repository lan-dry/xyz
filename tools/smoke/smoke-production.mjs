#!/usr/bin/env node
/**
 * pnpm smoke:production
 *
 * End-to-end smoke test of a deployed Aegis stack (Vercel console + Railway API/witness/Postgres,
 * optionally the bank simulator). HTTP only: it never connects to the database.
 *
 * It runs against a dedicated smoke-test tenant, NEVER Demo Bank. Hard guards (any failure aborts
 * before or right after the first event is written):
 *   - the organisation slug must be SMOKE_ORG_SLUG (default "smoke-test") and contain "smoke"
 *   - the organisation must not look like Demo Bank (a smoke tenant may be is_demo: that flag only adds
 *     the quiet tag and the 2-minute escalation window, and is how the hosted tooling provisions it)
 *   - with admin credentials, the ingest key prefix must match an active key of that tenant
 *   - the first event must be visible in that tenant's console, else the run stops
 *   - a bank simulator must report the same organisation id as the smoke tenant
 *
 * Steps (PASS / FAIL / SKIP per line, exit 1 on any FAIL, 2 on bad configuration):
 *   health, readiness, published keys, sign-in, tenant guards
 *   intake allow + hold, approval as officer (refused) and manager (approved) over console sessions
 *   evidence bundle -> aegis-verify PASS, tampered bundle -> FAIL (CLI and public verify API)
 *   witness inclusion + RFC 3161 trusted time (only when configured on the server)
 *   delegation (time-bound) and escalation (to a higher role)
 *   bank simulator through its own API (when BANK_SIMULATOR_URL + BANK_SIMULATOR_PASS are set)
 *
 * Environment (names only; values are never printed):
 *   SMOKE_API_BASE            Aegis API origin, e.g. https://api.salanor.com            required
 *   SMOKE_INGEST_KEY          ingest key of the smoke tenant                             required
 *   SMOKE_OFFICER_EMAIL / SMOKE_OFFICER_PASSWORD   a credit_officer member               required
 *   SMOKE_MANAGER_EMAIL / SMOKE_MANAGER_PASSWORD   a credit_manager member               required
 *   SMOKE_ID_BASE             Salanor ID origin (default: SMOKE_API_BASE)
 *   SMOKE_ORG_SLUG            default smoke-test
 *   SMOKE_ORGANIZATION_ID     only if a persona belongs to several organisations
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD       org admin: enables the ingest-key prefix guard
 *   SMOKE_DELEGATE_EMAIL / SMOKE_DELEGATE_PASSWORD a member with NO credit_manager role: enables delegation
 *   SMOKE_HEAD_EMAIL / SMOKE_HEAD_PASSWORD         head_of_compliance: lets the escalation step close the case
 *   SMOKE_ESCALATE_ROLE       default head_of_compliance
 *   SMOKE_EXPECT_CUSTODY      kms | software_interim: fail if the published key custody differs
 *   SMOKE_TSA_WAIT_SECONDS    default 90   (0 = do not wait for the trusted-time stamp)
 *   SMOKE_WITNESS_WAIT_SECONDS default 150 (0 = do not wait for witness inclusion)
 *   SMOKE_TIMED_ESCALATION=1  also wait for the 2-minute automatic escalation (is_demo tenants only)
 *   SMOKE_STRICT=1            treat SKIP as FAIL (use for the release gate)
 *   BANK_SIMULATOR_URL + BANK_SIMULATOR_PASS       also drive the bank simulator's own API
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STORIES } from "../bank-simulator/stories.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = process.env;
const RUN = randomUUID().replace(/-/g, "").slice(0, 8);

// ------------------------------------------------------------------ config

const need = [
  "SMOKE_API_BASE",
  "SMOKE_INGEST_KEY",
  "SMOKE_OFFICER_EMAIL",
  "SMOKE_OFFICER_PASSWORD",
  "SMOKE_MANAGER_EMAIL",
  "SMOKE_MANAGER_PASSWORD",
];
const missing = need.filter((k) => !env[k]?.trim());
if (missing.length) {
  console.error(`smoke:production needs these environment variables: ${missing.join(", ")}`);
  console.error("See the header of tools/smoke/smoke-production.mjs and docs/DEPLOY_PRODUCTION.md (smoke test).");
  process.exit(2);
}

const trim = (s) => (s ?? "").trim();
const API = trim(env.SMOKE_API_BASE).replace(/\/+$/, "");
const ID = (trim(env.SMOKE_ID_BASE) || API).replace(/\/+$/, "");
const INGEST_KEY = trim(env.SMOKE_INGEST_KEY);
const ORG_SLUG = trim(env.SMOKE_ORG_SLUG) || "smoke-test";
const ORG_HINT = trim(env.SMOKE_ORGANIZATION_ID);
const ESCALATE_ROLE = trim(env.SMOKE_ESCALATE_ROLE) || "head_of_compliance";
const STRICT = trim(env.SMOKE_STRICT) === "1";
const TSA_WAIT = Number(env.SMOKE_TSA_WAIT_SECONDS ?? 90);
const WITNESS_WAIT = Number(env.SMOKE_WITNESS_WAIT_SECONDS ?? 150);
const SIM_URL = trim(env.BANK_SIMULATOR_URL).replace(/\/+$/, "");
const SIM_PASS = trim(env.BANK_SIMULATOR_PASS);

const personas = {
  officer: { email: trim(env.SMOKE_OFFICER_EMAIL), password: env.SMOKE_OFFICER_PASSWORD },
  manager: { email: trim(env.SMOKE_MANAGER_EMAIL), password: env.SMOKE_MANAGER_PASSWORD },
};
for (const key of ["admin", "delegate", "head"]) {
  const email = trim(env[`SMOKE_${key.toUpperCase()}_EMAIL`]);
  const password = env[`SMOKE_${key.toUpperCase()}_PASSWORD`];
  if (email && password) personas[key] = { email, password };
}

if (/demo-bank/i.test(ORG_SLUG) || !/smoke/i.test(ORG_SLUG)) {
  console.error(
    `Refusing to run: SMOKE_ORG_SLUG="${ORG_SLUG}" must contain "smoke" and must not be Demo Bank. ` +
      "Use a dedicated smoke-test tenant.",
  );
  process.exit(2);
}

// ------------------------------------------------------------------ output (secrets never printed)

const secrets = new Set(
  [
    INGEST_KEY,
    SIM_PASS,
    ...Object.values(personas).map((p) => p.password),
  ].filter((s) => typeof s === "string" && s.length >= 6),
);
function redact(text) {
  let out = String(text);
  for (const s of secrets) out = out.split(s).join("***");
  return out.replace(/(salanor_session|bank_sim_session)=[^;\s"]+/g, "$1=***");
}

const results = [];
class Skip extends Error {}
class Abort extends Error {}

function print(status, name, detail) {
  results.push({ status, name });
  console.log(`${status.padEnd(4)}  ${name}${detail ? ` — ${redact(detail).slice(0, 300)}` : ""}`);
}

/** Run one step. fn returns a detail string, or throws Skip / Abort / Error. */
async function step(name, fn) {
  try {
    const detail = await fn();
    print("PASS", name, typeof detail === "string" ? detail : "");
    return true;
  } catch (err) {
    if (err instanceof Skip) {
      if (STRICT) print("FAIL", name, `skipped under SMOKE_STRICT: ${err.message}`);
      else print("SKIP", name, err.message);
      return false;
    }
    print("FAIL", name, err instanceof Error ? err.message : String(err));
    if (err instanceof Abort) throw err;
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, { tries = 8, delayMs = 1000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last) return last;
    if (i < tries - 1) await sleep(delayMs);
  }
  return last;
}
function expect(cond, message) {
  if (!cond) throw new Error(message);
}

// ------------------------------------------------------------------ http

async function http(url, { method = "GET", headers = {}, body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    throw new Error(`${method} ${new URL(url).pathname}: ${err?.cause?.code ?? err?.message ?? "network error"}`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, text, headers: res.headers };
}

class Session {
  constructor(label, cookie) {
    this.label = label;
    this.cookie = cookie;
    this.orgId = "";
  }
  static async login(label, persona) {
    const res = await http(`${ID}/v1/id/auth/login`, {
      method: "POST",
      body: {
        email: persona.email.toLowerCase(),
        password: persona.password,
        ...(ORG_HINT ? { organization_id: ORG_HINT } : {}),
      },
    });
    if (res.status !== 200) throw new Error(`${label} sign-in failed (http ${res.status}${res.data?.code ? `, ${res.data.code}` : ""})`);
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .find((c) => c?.startsWith("salanor_session="));
    if (!cookie) throw new Error(`${label} sign-in returned no session cookie`);
    return new Session(label, cookie);
  }
  /** Console API call (never throws on http status; returns { status, data, text }). */
  call(path, init = {}) {
    return http(`${API}/v1/console${path}`, { ...init, headers: { Cookie: this.cookie, ...init.headers } });
  }
}

const sessions = {};
let orgId = "";
let isDemoTenant = false;

// ------------------------------------------------------------------ events

const storyById = (id) => {
  const s = STORIES.find((x) => x.id === id);
  if (!s) throw new Error(`story ${id} not in tools/bank-simulator/stories.mjs`);
  return s;
};

let seq = 0;
/** Send one governed event through the real intake with the ingest key. */
async function intake(story, label) {
  seq += 1;
  const suffix = `${RUN}-${seq}`;
  const caseId = `SMOKE-${suffix}`.toUpperCase();
  const traceId = `tr_smoke_${RUN}_${seq}`;
  const body = {
    schema_version: 1,
    case_id: caseId,
    idempotency_key: `smoke-${story.id}-${suffix}`,
    event_type: story.event_type,
    product: story.product,
    emitted_at: new Date().toISOString(),
    actor: { type: "system", id: story.agent_slug },
    attributes: { ...story.attributes },
    trace_id: traceId,
  };
  const res = await http(`${API}/v1/aegis/governed/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${INGEST_KEY}`, "Idempotency-Key": body.idempotency_key },
    body,
  });
  if (res.status !== 200) {
    throw new Error(`${label}: intake http ${res.status} ${res.data?.message ?? res.data?.error ?? ""}`.trim());
  }
  return { caseId, traceId, decision: res.data };
}

/** Find (or raise) the approval for a held case. */
async function approvalFor({ traceId, decision }) {
  const fromDecision = decision?.approval?.approval_id;
  if (fromDecision) return fromDecision;
  if (decision?.event_id) {
    await http(`${API}/v1/aegis/approvals/request`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_KEY}` },
      body: {
        organization_id: orgId,
        event_id: decision.event_id,
        trace_id: traceId,
        tool_name: "governed.action",
        deferred: { url: "https://example.test/smoke-callback", method: "POST" },
      },
    });
  }
  const found = await until(
    async () => {
      const list = await sessions.manager.call("/approvals?status=pending");
      return list.data?.approvals?.find((a) => a.trace_id === traceId)?.approval_id ?? null;
    },
    { tries: 6, delayMs: 1000 },
  );
  if (!found) throw new Error("no approval request appeared for the held case");
  return found;
}

const approve = (session, approvalId, reason, extras = {}) =>
  session.call(`/approvals/${encodeURIComponent(approvalId)}/approve`, {
    method: "POST",
    body: {
      reason,
      comment: reason,
      // Simulator-raised holds require reason_code (and often comment) in required_fields.
      reason_code: extras.reason_code ?? "SMOKE_OK",
      ...(typeof extras.callback_verified === "boolean"
        ? { callback_verified: extras.callback_verified }
        : {}),
    },
  });

async function traceVisible(traceId) {
  return until(async () => (await sessions.officer.call(`/traces/${encodeURIComponent(traceId)}`)).status === 200, {
    tries: 8,
    delayMs: 1000,
  });
}

// ------------------------------------------------------------------ bundle / verify helpers

let workDir = null;
const work = () => (workDir ??= mkdtempSync(join(tmpdir(), "smoke-aegis-")));

async function fetchBundle(traceId) {
  const res = await until(
    async () => {
      const r = await sessions.manager.call(`/traces/${encodeURIComponent(traceId)}/evidence-bundle`);
      return r.status === 200 && r.data?.receipts?.length ? r : null;
    },
    { tries: 10, delayMs: 1000 },
  );
  if (!res) throw new Error("evidence bundle not available (no signed receipt for the case?)");
  return res;
}

function runAegisVerify(bundlePath, keysPath) {
  const r = spawnSync(
    "pnpm",
    ["exec", "tsx", "tools/aegis-verify/cli.mts", bundlePath, "--keys", keysPath],
    { cwd: root, shell: process.platform === "win32", encoding: "utf8" },
  );
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const STRUCTURAL = new Set([
  "receipt_id", "seq", "prev_hash", "receipt_hash", "key_id", "sig_alg", "sig_value_b64", "sealed_events",
]);
/** Change one signed fact in the first receipt without touching its hash or signature. */
function tamper(bundle) {
  const copy = JSON.parse(JSON.stringify(bundle));
  const r = copy.receipts[0];
  for (const key of Object.keys(r)) {
    if (STRUCTURAL.has(key)) continue;
    const v = r[key];
    if (typeof v === "number") { r[key] = v + 1; return copy; }
    if (typeof v === "string") { r[key] = `${v} (edited)`; return copy; }
    if (typeof v === "boolean") { r[key] = !v; return copy; }
  }
  r.smoke_tamper = true;
  return copy;
}

// ------------------------------------------------------------------ run

const ctx = { keysPath: null, bundle: null, holdCase: null, publicKeys: null };

async function main() {
  console.log(`smoke:production run ${RUN} -> ${API} (tenant slug "${ORG_SLUG}")`);
  if (workDir === null) work();

  await step("API health", async () => {
    const res = await http(`${API}/health`);
    expect(res.status === 200 && res.data?.status === "ok", `http ${res.status} ${res.data?.status ?? ""}`);
    return `database=${res.data.database}`;
  });

  let ready = null;
  await step("API readiness (/ready)", async () => {
    const res = await http(`${API}/ready`);
    ready = res.data;
    expect(res.status === 200, `http ${res.status} status=${res.data?.status ?? "?"}`);
    const checks = res.data?.checks ?? {};
    const parts = [];
    if (checks.signing_key) parts.push(`signing_key=${checks.signing_key.custody ?? checks.signing_key.status ?? "ok"}`);
    if (checks.witness) parts.push(`witness=${checks.witness.configured ? (checks.witness.ok ? "ok" : "STALE") : "not configured"}`);
    if (checks.tsa) parts.push(`tsa=${checks.tsa.configured ? (checks.tsa.reachable === false ? "unreachable" : "ok") : "not configured"}`);
    return parts.join(" ");
  });

  await step("published receipt keys (/v1/public/keys)", async () => {
    const res = await http(`${API}/v1/public/keys`);
    expect(res.status === 200 && Array.isArray(res.data?.keys) && res.data.keys.length > 0, `http ${res.status}, no keys`);
    ctx.publicKeys = res.data.keys;
    const active = res.data.keys.filter((k) => k.status !== "retired");
    const custody = [...new Set(active.map((k) => k.custody))].join(",");
    const want = trim(env.SMOKE_EXPECT_CUSTODY);
    if (want) expect(custody === want, `key custody is "${custody}", expected "${want}"`);
    const flat = await http(`${API}/v1/public/keys.json`);
    expect(flat.status === 200 && flat.data && typeof flat.data === "object", `keys.json http ${flat.status}`);
    ctx.keysPath = join(work(), "keys.json");
    writeFileSync(ctx.keysPath, JSON.stringify(flat.data));
    return `${active.length} active, custody=${custody}`;
  });

  // ---- sign in + tenant guards (before any event is written)
  const signedIn = await step("sign in (console sessions)", async () => {
    for (const [label, persona] of Object.entries(personas)) {
      sessions[label] = await Session.login(label, persona);
    }
    return Object.keys(sessions).join(", ");
  });
  if (!signedIn) throw new Abort("cannot continue without console sessions");

  await step("tenant guard: smoke tenant, not Demo Bank", async () => {
    const seen = new Set();
    for (const [label, s] of Object.entries(sessions)) {
      const res = await s.call("/organization/profile");
      expect(res.status === 200, `${label}: profile http ${res.status}`);
      const o = res.data?.organization ?? {};
      if (/demo-bank/i.test(o.slug ?? "") || o.slug !== ORG_SLUG) {
        throw new Abort(
          `${label} belongs to "${o.slug}"; expected "${ORG_SLUG}". Refusing to write events.`,
        );
      }
      s.orgId = o.organization_id;
      isDemoTenant = o.is_demo === true;
      seen.add(o.organization_id);
    }
    expect(seen.size === 1, "personas belong to different organisations");
    orgId = [...seen][0];
    return `slug=${ORG_SLUG} is_demo=${isDemoTenant}`;
  });

  await step("tenant guard: ingest key belongs to the smoke tenant", async () => {
    if (!sessions.admin) throw new Skip("set SMOKE_ADMIN_EMAIL/PASSWORD to check the ingest key prefix");
    const res = await sessions.admin.call("/ingest-keys");
    expect(res.status === 200, `http ${res.status}`);
    const hit = (res.data?.keys ?? []).some((k) => k.active && INGEST_KEY.startsWith(k.key_prefix));
    if (!hit) throw new Abort("SMOKE_INGEST_KEY does not match any active ingest key of the smoke tenant");
    return "prefix matches an active key";
  });

  // ---- intake
  let allowCase = null;
  await step("intake: allow (within officer limit)", async () => {
    allowCase = await intake(storyById("loan_within_limit"), "allow");
    expect(allowCase.decision.outcome === "allow", `outcome=${allowCase.decision.outcome}, expected allow`);
    expect(allowCase.decision.event_id, "no sealed event_id (agent signing key / bridge missing?)");
    return `rule=${(allowCase.decision.matched_rules ?? []).map((r) => r.rule_id).join(",") || "-"}`;
  });

  await step("tenant guard: event is visible in the smoke tenant console", async () => {
    if (!allowCase) throw new Abort("no event was written");
    const ok = await traceVisible(allowCase.traceId);
    if (!ok) {
      throw new Abort(
        "the event is not visible in the smoke tenant: the ingest key probably belongs to another tenant. STOP and check it.",
      );
    }
    return "trace found";
  });

  // ---- hold + approvals
  let holdCase = null;
  let holdApprovalId = null;
  await step("intake: hold (above officer limit)", async () => {
    holdCase = await intake(storyById("loan_needs_manager"), "hold");
    expect(holdCase.decision.outcome === "hold", `outcome=${holdCase.decision.outcome}, expected hold`);
    holdApprovalId = await approvalFor(holdCase);
    return `approval=${holdApprovalId}`;
  });

  await step("approval: officer is refused (role)", async () => {
    if (!holdApprovalId) throw new Skip("no held case");
    const res = await approve(sessions.officer, holdApprovalId, "Smoke test: officer must not be able to approve");
    expect(res.status === 403, `officer approve returned http ${res.status}, expected 403`);
    return `403 ${res.data?.code ?? ""}`.trim();
  });

  await step("approval: manager approves with reason", async () => {
    if (!holdApprovalId) throw new Skip("no held case");
    const res = await approve(sessions.manager, holdApprovalId, "Smoke test: approved by credit manager");
    expect(res.status === 200, `manager approve http ${res.status} ${res.data?.error ?? ""}`);
    expect(res.data?.finalized === true, `not finalized (votes ${res.data?.votes}/${res.data?.required})`);
    ctx.holdCase = holdCase;
    return `status=${res.data?.approval?.status ?? "?"} votes=${res.data?.votes}/${res.data?.required}`;
  });

  // ---- evidence + verify + tamper
  let bundleRes = null;
  await step("evidence bundle downloads", async () => {
    if (!ctx.holdCase) throw new Skip("approval step did not complete");
    bundleRes = await fetchBundle(ctx.holdCase.traceId);
    ctx.bundle = bundleRes.data;
    const approved = (ctx.bundle.approvals ?? []).some((a) => /approved/i.test(a.status));
    return `receipts=${ctx.bundle.receipts.length} approvals_approved=${approved}`;
  });

  let goodPath = null;
  await step("aegis-verify: untouched bundle PASSES", async () => {
    if (!ctx.bundle) throw new Skip("no bundle");
    goodPath = join(work(), "bundle.json");
    writeFileSync(goodPath, bundleRes.text);
    const r = runAegisVerify(goodPath, ctx.keysPath);
    expect(r.code === 0 && /^OK /m.test(r.out), `exit ${r.code}: ${r.out.trim().split(/\r?\n/).slice(0, 3).join(" | ")} (is pnpm install done?)`);
    return r.out.trim().split(/\r?\n/).pop();
  });

  await step("aegis-verify: tampered bundle FAILS", async () => {
    if (!ctx.bundle) throw new Skip("no bundle");
    const bad = tamper(ctx.bundle);
    const badPath = join(work(), "bundle-tampered.json");
    writeFileSync(badPath, JSON.stringify(bad));
    const r = runAegisVerify(badPath, ctx.keysPath);
    // A crash (missing dependency, bad args) also exits non-zero; only a real finding counts.
    const finding = r.out.match(/^- \[(\w+)\]/m)?.[1];
    expect(r.code === 1 && /^FAIL/m.test(r.out) && finding, `no verification finding (exit ${r.code}): ${r.out.trim().split(/\r?\n/).slice(0, 2).join(" | ")}`);
    return `exit 1 (${finding})`;
  });

  await step("public verify API: good passes, tampered fails", async () => {
    if (!ctx.bundle) throw new Skip("no bundle");
    const good = await http(`${API}/v1/public/evidence-bundle/verify`, { method: "POST", body: bundleRes.text, raw: true, headers: { "Content-Type": "application/json" } });
    expect(good.data?.ok === true, `untouched bundle not ok (http ${good.status})`);
    const bad = await http(`${API}/v1/public/evidence-bundle/verify`, { method: "POST", body: JSON.stringify(tamper(ctx.bundle)), raw: true, headers: { "Content-Type": "application/json" } });
    expect(bad.data?.ok === false, `tampered bundle was not rejected (http ${bad.status})`);
    return "ok=true / ok=false";
  });

  // ---- witness + trusted time
  await step("witness: worker alive, case included in a Merkle batch", async () => {
    const w = ready?.checks?.witness;
    if (!w?.configured) throw new Skip("witness worker not configured on this API");
    expect(w.ok, "/ready reports the witness worker stale");
    if (!ctx.holdCase) throw new Skip("no bundle");
    const included = (b) => Array.isArray(b?.witness) && b.witness.length > 0 && b.witness.every((e) => e.status === "included");
    if (included(ctx.bundle)) return "included";
    if (WITNESS_WAIT <= 0) return "pending (not waiting: SMOKE_WITNESS_WAIT_SECONDS=0)";
    const deadline = Date.now() + WITNESS_WAIT * 1000;
    while (Date.now() < deadline) {
      await sleep(5000);
      const r = await sessions.manager.call(`/traces/${encodeURIComponent(ctx.holdCase.traceId)}/evidence-bundle`);
      if (r.status === 200 && included(r.data)) return "included after waiting";
    }
    throw new Error(`still pending after ${WITNESS_WAIT}s (witness interval too long, or worker not batching)`);
  });

  await step("trusted time: receipt stamped by an outside TSA", async () => {
    const t = ready?.checks?.tsa;
    if (!t?.configured) throw new Skip("AEGIS_TSA_URL not configured (receipts carry signing time only)");
    if (!ctx.holdCase) throw new Skip("no bundle");
    const stamped = (b) => Array.isArray(b?.trusted_time) && b.trusted_time.length > 0 && b.trusted_time.every((x) => x.status === "stamped");
    let b = ctx.bundle;
    const deadline = Date.now() + Math.max(TSA_WAIT, 0) * 1000;
    while (!stamped(b) && Date.now() < deadline) {
      await sleep(5000);
      const r = await sessions.manager.call(`/traces/${encodeURIComponent(ctx.holdCase.traceId)}/evidence-bundle`);
      if (r.status === 200) b = r.data;
    }
    if (!stamped(b)) {
      throw new Error(
        `not stamped within ${TSA_WAIT}s (public TSAs have no SLA; check outbound access on port 80 and /ready checks.tsa)`,
      );
    }
    const first = b.trusted_time[0];
    return `${first.authority ?? "TSA"} at ${first.gen_time_utc ?? "?"}`;
  });

  // ---- delegation
  await step("delegation: member acts only inside a time-bound window", async () => {
    if (!sessions.delegate) throw new Skip("set SMOKE_DELEGATE_EMAIL/PASSWORD (a member without credit_manager)");
    const overview = await sessions.manager.call("/delegations");
    expect(overview.status === 200, `GET /delegations http ${overview.status}`);
    const me = (overview.data.members ?? []).find((m) => m.email.toLowerCase() === personas.delegate.email.toLowerCase());
    expect(me, "the delegate is not an active member of the smoke tenant");
    expect(!(me.bank_roles ?? []).includes("credit_manager"), "the delegate already holds credit_manager; use a plain member");

    let delegateId = null;
    try {
      const before = await intake(storyById("loan_needs_manager"), "delegation before");
      const beforeId = await approvalFor(before);
      const denied = await approve(sessions.delegate, beforeId, "Smoke test: no delegation yet");
      expect(denied.status === 403, `delegate approved before any delegation (http ${denied.status})`);

      const grant = await sessions.manager.call("/delegations", {
        method: "POST",
        body: { membership_id: me.membership_id, role_key: "credit_manager", duration_minutes: 5 },
      });
      expect(grant.status === 201, `grant http ${grant.status} ${grant.data?.error ?? ""}`);
      delegateId = grant.data.delegate_id;

      const inside = await approve(sessions.delegate, beforeId, "Smoke test: approved under delegation");
      expect(inside.status === 200, `delegate inside the window http ${inside.status} ${inside.data?.error ?? ""}`);

      const revoke = await sessions.manager.call(`/delegations/${encodeURIComponent(delegateId)}`, { method: "DELETE" });
      expect([200, 204].includes(revoke.status), `revoke http ${revoke.status}`);
      delegateId = null;

      const after = await intake(storyById("loan_needs_manager"), "delegation after");
      const afterId = await approvalFor(after);
      const outside = await approve(sessions.delegate, afterId, "Smoke test: after the window");
      expect(outside.status === 403, `delegate approved after revocation (http ${outside.status})`);
      return "403 before, 200 inside, 403 after revoke";
    } finally {
      if (delegateId) await sessions.manager.call(`/delegations/${encodeURIComponent(delegateId)}`, { method: "DELETE" }).catch(() => {});
    }
  });

  // ---- escalation
  await step(`escalation: raised to ${ESCALATE_ROLE}, manager no longer sufficient`, async () => {
    const c = await intake(storyById("loan_needs_manager"), "escalation");
    const id = await approvalFor(c);
    const esc = await sessions.manager.call(`/approvals/${encodeURIComponent(id)}/escalate`, {
      method: "POST",
      body: { escalate_to_role: ESCALATE_ROLE },
    });
    expect(esc.status === 200, `escalate http ${esc.status} ${esc.data?.error ?? esc.data?.code ?? ""}`);
    const detail = await sessions.manager.call(`/approvals/${encodeURIComponent(id)}`);
    const required = detail.data?.approval?.metadata?.required_role;
    expect(required === ESCALATE_ROLE, `required_role is "${required}" after escalation`);
    const manager = await approve(sessions.manager, id, "Smoke test: manager after escalation");
    expect(manager.status === 403, `manager could still approve after escalation (http ${manager.status})`);
    if (sessions.head) {
      const head = await approve(sessions.head, id, "Smoke test: approved by the escalated role");
      expect(head.status === 200, `escalated role approve http ${head.status} ${head.data?.error ?? ""}`);
      return `escalated, manager 403, ${ESCALATE_ROLE} 200`;
    }
    return `escalated, manager 403; case left pending (set SMOKE_HEAD_EMAIL/PASSWORD to close it)`;
  });

  // ---- timed escalation (real elapsed time; only on an is_demo tenant, slow, opt-in)
  await step("escalation: held case escalates by itself after the time limit", async () => {
    if (trim(env.SMOKE_TIMED_ESCALATION) !== "1") throw new Skip("set SMOKE_TIMED_ESCALATION=1 (waits about 2.5 minutes)");
    if (!isDemoTenant) throw new Skip("the 2-minute escalation window is configured only on is_demo tenants");
    const c = await intake(storyById("escalation_time_limit"), "timed escalation");
    const id = await approvalFor(c);
    const deadline = Date.now() + 200_000;
    while (Date.now() < deadline) {
      await sleep(10_000);
      // Listing pending approvals runs the escalation sweep on the server.
      await sessions.manager.call("/approvals?status=pending");
      const d = await sessions.manager.call(`/approvals/${encodeURIComponent(id)}`);
      const m = d.data?.approval?.metadata ?? {};
      if (typeof m.escalated_to_role_at === "string") return `escalated to ${m.required_role ?? "?"}`;
    }
    throw new Error("not escalated within 200s");
  });

  // ---- bank simulator, through its own API
  await simulatorSteps();
}

// ------------------------------------------------------------------ bank simulator

async function simulatorSteps() {
  if (!SIM_URL || !SIM_PASS) {
    await step("bank simulator (own API)", async () => {
      throw new Skip("set BANK_SIMULATOR_URL and BANK_SIMULATOR_PASS to test the simulator");
    });
    return;
  }
  const simHeaders = { "X-Simulator": "1" };
  let cookie = null;
  const sim = (path, init = {}) =>
    http(`${SIM_URL}${path}`, { ...init, headers: { ...simHeaders, ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });

  const reachable = await step("simulator: reachable and login enforced", async () => {
    const health = await http(`${SIM_URL}/health`);
    expect(health.status === 200, `/health http ${health.status}`);
    const anon = await sim("/api/state");
    expect(anon.status === 401, `unauthenticated /api/state returned ${anon.status}; the simulator must require login`);
    const bad = await sim("/api/login", { method: "POST", body: { passphrase: `wrong-${RUN}-passphrase` } });
    expect(bad.status === 401, `wrong passphrase returned ${bad.status}, expected 401`);
    return "401 without session, 401 for a wrong passphrase";
  });
  if (!reachable) return;

  const loggedIn = await step("simulator: sign in with the shared passphrase (session cookie)", async () => {
    const res = await sim("/api/login", { method: "POST", body: { passphrase: SIM_PASS } });
    expect(res.status === 200, `login http ${res.status}${res.status === 429 ? " (rate limited, wait 15 minutes)" : ""}`);
    cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c?.startsWith("bank_sim_session="));
    expect(cookie, "no session cookie returned");
    const set = (res.headers.getSetCookie?.() ?? [])[0] ?? "";
    expect(/HttpOnly/i.test(set), "session cookie is not HttpOnly");
    return "HttpOnly session cookie";
  });
  if (!loggedIn) return;

  const tenantOk = await step("simulator: points at the smoke tenant", async () => {
    const state = (await sim("/api/state")).data ?? {};
    expect(/simulated core banking system/i.test(state.label ?? ""), "label is not \"Simulated core banking system\"");
    if (!state.organization_id) {
      throw new Abort("the simulator has no AEGIS_ORGANIZATION_ID, so its tenant cannot be confirmed. Refusing to send events.");
    }
    if (state.organization_id !== orgId) {
      throw new Abort(`the simulator is configured for a different tenant (${state.organization_id}). Refusing to send events.`);
    }
    return "organisation matches";
  });
  if (!tenantOk) return;

  await step("simulator: story list", async () => {
    const res = await sim("/api/stories");
    expect(res.status === 200 && res.data?.stories?.length >= 5, `stories http ${res.status}`);
    expect(res.data.stories.some((s) => s.id === "loan_within_limit"), "loan_within_limit missing");
    return `${res.data.stories.length} stories`;
  });

  const runStory = async (id) => {
    const res = await sim("/api/story", { method: "POST", body: { story_id: id } });
    expect(res.status === 200 && res.data?.ok, `story ${id} http ${res.status} ${res.data?.error ?? ""}`);
    return res.data;
  };

  await step("simulator: allowed story, case visible in the console", async () => {
    const r = await runStory("loan_within_limit");
    expect(r.outcome === "allow", `outcome=${r.outcome}, expected allow`);
    expect(await traceVisible(r.trace_id), "case not visible in the smoke tenant console");
    expect(/\/aegis\/traces\//.test(r.console_url ?? ""), "no console link in the result");
    return `case ${r.case_id}`;
  });

  await step("simulator: hold story, approval raised, manager approves", async () => {
    const r = await runStory("loan_needs_manager");
    expect(r.outcome === "hold", `outcome=${r.outcome}, expected hold`);
    expect(r.approval_id, "no approval was raised (AEGIS_ORGANIZATION_ID on the simulator?)");
    const res = await approve(sessions.manager, r.approval_id, "Smoke test: simulator case approved");
    expect(res.status === 200 && res.data?.finalized === true, `manager approve http ${res.status} ${res.data?.error ?? ""}`);
    return `approval ${r.approval_id}`;
  });

  await step("simulator: Aegis unreachable toggle queues, then replays", async () => {
    let offlineOn = false;
    try {
      const on = await sim("/api/unreachable", { method: "POST", body: { on: true } });
      expect(on.status === 200 && on.data?.offline === true, `toggle on http ${on.status}`);
      offlineOn = true;
      const queued = await runStory("loan_within_limit");
      expect(queued.queued === true && queued.decided_without_aegis === true, "story was not queued while offline");
      const off = await sim("/api/unreachable", { method: "POST", body: { on: false } });
      offlineOn = false;
      expect(off.status === 200 && off.data?.offline === false, `toggle off http ${off.status}`);
      const replayed = off.data?.replayed ?? [];
      expect(replayed.length >= 1, "nothing was replayed when the link came back");
      expect(await traceVisible(replayed[0].trace_id), "replayed case not visible in the console");
      return `${replayed.length} replayed`;
    } finally {
      if (offlineOn) await sim("/api/unreachable", { method: "POST", body: { on: false } }).catch(() => {});
    }
  });
}

// ------------------------------------------------------------------ finish

let aborted = false;
try {
  await main();
} catch (err) {
  aborted = true;
  console.error(`\nABORTED: ${redact(err instanceof Error ? err.message : String(err))}`);
} finally {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
}

const count = (s) => results.filter((r) => r.status === s).length;
const failed = count("FAIL") + (aborted && count("FAIL") === 0 ? 1 : 0);
console.log(`\nsmoke:production done — pass=${count("PASS")} fail=${failed} skip=${count("SKIP")}${STRICT ? " (strict)" : ""}`);
process.exit(failed > 0 ? 1 : 0);
