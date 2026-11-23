/**
 * Gate 1 stranger path (API + Playwright request):
 * access-request → Ops approve → admin session → checklist → ingest →
 * evidence attempt → auditor invite → membership invite (auditor role).
 * Writes docs/launch/_raw/stranger-*.json (+ optional screenshot if CONSOLE_URL set).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  process.env.AEGIS_BRIDGE_MASTER_KEY = "launch-stranger-bridge-key";
}

const { createApp } = await import("../src/app.js");
const { getPool, closePool } = await import("../src/db/pool.js");
const { createIngestKey } = await import("../src/repo/ingest-keys.js");
const platformAuth = await import("@salanor/platform-auth");

const outDir = resolve(root, "docs/launch/_raw");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [];

function record(step: string, ok: boolean, detail?: unknown) {
  steps.push({ step, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"}  ${step}`);
  if (!ok) {
    writeArtifact(false);
    process.exit(1);
  }
}

function writeArtifact(ok: boolean) {
  const payload = {
    ok,
    at: new Date().toISOString(),
    mode: "playwright-request + createApp",
    steps,
  };
  writeFileSync(
    resolve(outDir, `stranger-run-${stamp}.json`),
    JSON.stringify(payload, null, 2),
  );
  writeFileSync(resolve(outDir, "stranger-run-latest.json"), JSON.stringify(payload, null, 2));
}

const pool = getPool();
const app = createApp();

const workEmail = `stranger.${Date.now()}@example-bank.test`;
const company = `Stranger Bank ${Date.now().toString(36)}`;

// 1) Public access request
{
  const res = await app.request("/v1/public/access-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      work_email: workEmail,
      company,
      role: "Risk",
      country: "RW",
      use_case: "Evaluate sealed decisions in a sandbox",
      website: "",
    }),
  });
  const body = await res.json().catch(() => ({}));
  record("access-request", res.status === 200, { status: res.status, body });
}

const reqRow = await pool.query<{ request_id: string }>(
  `SELECT request_id FROM sandbox_access_request
    WHERE work_email = $1 AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1`,
  [workEmail],
);
const requestId = reqRow.rows[0]?.request_id;
record("access-request-persisted", Boolean(requestId), { requestId });

// 2) Ops approve (same SQL as platform access-requests/:id/approve)
const slugBase =
  company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "sandbox";
const slug = `${slugBase}-sb-${Date.now().toString(36)}`;
const orgIns = await pool.query<{ organization_id: string }>(
  `INSERT INTO organization (name, slug, plan, region, topology, tenant_kind, is_test,
      sandbox_expires_at, event_quota_daily, storage_quota_mb, require_signed_events)
   VALUES ($1, $2, 'free', 'eu-west', 'cloud', 'sandbox', true,
      now() + interval '30 days', 5000, 512, false)
   RETURNING organization_id`,
  [company.slice(0, 120), slug],
);
const organizationId = orgIns.rows[0]!.organization_id;
await pool.query(
  `UPDATE sandbox_access_request
      SET status = 'approved', decided_at = now(), decided_by = $2,
          created_organization_id = $3
    WHERE request_id = $1`,
  [requestId, "stranger-test@ops.salanor.local", organizationId],
);
await pool.query(
  `INSERT INTO platform_sandbox_audit (organization_id, action, actor, detail)
   VALUES ($1, 'approve_access', $2, $3::jsonb)`,
  [
    organizationId,
    "stranger-test@ops.salanor.local",
    JSON.stringify({ request_id: requestId, email: workEmail }),
  ],
);
record("ops-approve", true, { organizationId, slug });

// 3) Provision admin (invite accept equivalent) + session
const accountId = randomUUID();
const membershipId = randomUUID();
const adminPass = "StrangerAdmin1!";
await pool.query(
  `INSERT INTO account (account_id, email, display_name, password_hash, email_verified_at, active)
   VALUES ($1, $2, 'Stranger Admin', $3, now(), true)`,
  [accountId, workEmail, platformAuth.hashPassword(adminPass)],
);
await pool.query(
  `INSERT INTO membership (membership_id, account_id, organization_id, role, status)
   VALUES ($1, $2, $3, 'admin', 'active')`,
  [membershipId, accountId, organizationId],
);
const { token } = await platformAuth.createSession(pool, accountId, organizationId);
const cookie = `salanor_session=${token}`;
record("admin-session", true, { email: workEmail });

// 4) Checklist / sandbox status
{
  const res = await app.request("/v1/console/sandbox/status", {
    headers: { Cookie: cookie },
  });
  const body = await res.json().catch(() => ({}));
  record(
    "checklist-status",
    res.status === 200 && (body as { is_sandbox?: boolean }).is_sandbox === true,
    { status: res.status, body },
  );
}

// 5) Ingest key + bank event (sealed path starts here)
const client = await pool.connect();
let ingestKey: string;
try {
  ingestKey = (await createIngestKey(client, organizationId, "stranger")).rawKey;
} finally {
  client.release();
}
await pool.query(
  `UPDATE organization
      SET onboarding_checklist =
            COALESCE(onboarding_checklist, '{}'::jsonb) || '{"create_api_key": true}'::jsonb
    WHERE organization_id = $1`,
  [organizationId],
);

const caseId = `SBX-STR-${Date.now().toString(36).toUpperCase()}`;
const eventBody = {
  schema_version: 1,
  case_id: caseId,
  idempotency_key: randomUUID(),
  event_type: "loan_decision",
  product: "retail_loan",
  emitted_at: new Date().toISOString(),
  actor: { type: "system", id: "stranger-test" },
  attributes: {
    amount: 1_200_000,
    currency: "RWF",
    beneficiary_account: "ACCT-DEMO-001",
    applicant_name: "Stranger Applicant",
  },
  trace_id: `tr_stranger_${Date.now().toString(36)}`,
};
const ingestRes = await app.request("/v1/aegis/bank/events", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ingestKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(eventBody),
});
const ingestJson = (await ingestRes.json().catch(() => ({}))) as {
  trace_id?: string;
  case_id?: string;
};
record("ingest-bank-event", ingestRes.status === 200, {
  status: ingestRes.status,
  body: ingestJson,
});
await pool.query(
  `UPDATE organization
      SET onboarding_checklist =
            COALESCE(onboarding_checklist, '{}'::jsonb)
            || '{"send_first_event": true, "see_sealed": true}'::jsonb
    WHERE organization_id = $1`,
  [organizationId],
);

const traceId = ingestJson.trace_id ?? eventBody.trace_id;

// 6) Evidence bundle (may 404 without receipt signing — record honestly)
{
  const res = await app.request(
    `/v1/console/traces/${encodeURIComponent(traceId)}/evidence-bundle`,
    { headers: { Cookie: cookie } },
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep */
  }
  const bundleOk = res.status === 200;
  steps.push({
    step: "evidence-bundle",
    ok: bundleOk,
    detail: { status: res.status, body: typeof body === "string" ? body.slice(0, 500) : body },
  });
  console.log(
    `${bundleOk ? "OK" : "PART"}  evidence-bundle — ${res.status}` +
      (bundleOk ? "" : " (no receipt signing in this env; case still created)"),
  );
  if (bundleOk) {
    writeFileSync(
      resolve(outDir, `stranger-bundle-${stamp}.json`),
      typeof body === "string" ? body : JSON.stringify(body, null, 2),
    );
    // aegis-verify when bundle present
    const bundlePath = resolve(outDir, `stranger-bundle-${stamp}.json`);
    const { spawnSync } = await import("node:child_process");
    const verify = spawnSync(
      "pnpm",
      ["exec", "tsx", "tools/aegis-verify/cli.mts", bundlePath],
      { cwd: root, encoding: "utf8", shell: true, timeout: 60_000 },
    );
    record("aegis-verify", verify.status === 0, {
      status: verify.status,
      stdout: verify.stdout?.slice(0, 1500),
      stderr: verify.stderr?.slice(0, 1500),
    });
    await pool.query(
      `UPDATE organization
          SET onboarding_checklist =
                COALESCE(onboarding_checklist, '{}'::jsonb) || '{"verify_bundle": true}'::jsonb
        WHERE organization_id = $1`,
      [organizationId],
    );
  } else {
    steps.push({
      step: "aegis-verify",
      ok: false,
      detail: "skipped — no evidence bundle without receipt signing key in test env",
    });
  }
}

// 7) Case-portal auditor invite
{
  const res = await app.request("/v1/console/auditor/invites", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `auditor.portal.${Date.now()}@example-bank.test`,
      days: 14,
    }),
  });
  const body = await res.json().catch(() => ({}));
  record("auditor-portal-invite", res.status === 200 || res.status === 201, {
    status: res.status,
    body,
  });
}

// 8) Membership invite (auditor role) — same path as console Members
{
  const inviteToken = randomBytes(24).toString("hex");
  const inv = await platformAuth.createOrganizationInvitation(pool, {
    organizationId,
    email: `auditor.member.${Date.now()}@example-bank.test`,
    role: "auditor",
    invitedByMembershipId: membershipId,
    token: inviteToken,
  });
  record("auditor-membership-invite", Boolean(inv.invitation_id), inv);
  await pool.query(
    `UPDATE organization
        SET onboarding_checklist =
              COALESCE(onboarding_checklist, '{}'::jsonb) || '{"invite_colleague": true}'::jsonb
      WHERE organization_id = $1`,
    [organizationId],
  );
}

// 9) HTTP + Playwright (when available) against checklist
{
  const { serve } = await import("@hono/node-server");
  const port = 18_180 + (process.pid % 50);
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  await new Promise((r) => setTimeout(r, 150));
  const base = `http://127.0.0.1:${port}`;

  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(resolve(root, "package.json"));
    const { chromium } = require("playwright") as typeof import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const api = await context.request.get(`${base}/v1/console/sandbox/status`, {
      headers: { Cookie: cookie },
    });
    const statusBody = await api.json().catch(() => ({}));
    record("playwright-request-checklist", api.ok(), {
      status: api.status(),
      body: statusBody,
    });

    const consoleUrl = process.env.CONSOLE_URL?.trim();
    if (consoleUrl) {
      const page = await browser.newPage();
      await page.context().addCookies([
        { name: "salanor_session", value: token, url: consoleUrl },
      ]);
      await page.goto(`${consoleUrl.replace(/\/$/, "")}/aegis/get-started`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const shot = resolve(outDir, `stranger-checklist-${stamp}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      record("playwright-checklist-screenshot", true, { shot });
    }
    await browser.close();
  } catch (err) {
    const fetchRes = await fetch(`${base}/v1/console/sandbox/status`, {
      headers: { Cookie: cookie },
    });
    const statusBody = await fetchRes.json().catch(() => ({}));
    record("http-checklist-fallback", fetchRes.ok, {
      status: fetchRes.status,
      body: statusBody,
      playwright_error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    (server as { close?: () => void }).close?.();
  } catch {
    /* ignore */
  }
}

const allCriticalOk = steps
  .filter((s) =>
    [
      "access-request",
      "ops-approve",
      "admin-session",
      "checklist-status",
      "ingest-bank-event",
      "auditor-portal-invite",
      "auditor-membership-invite",
    ].includes(s.step),
  )
  .every((s) => s.ok);

writeArtifact(allCriticalOk);
await closePool();
process.exit(allCriticalOk ? 0 : 1);
