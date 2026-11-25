/**
 * Gate 1 stranger path (release blocker):
 * public access-request → Ops approve → invite signup-accept (set password) →
 * API key → Test sender (routine + held) → open sealed receipt → approve held →
 * download evidence → aegis-verify → invite colleague → checklist auto-ticks →
 * optional Chromium smoke (approvals UI).
 *
 * Fresh CI DB (quality-gate) or unique org per run. Exit 0 only if critical steps pass.
 * Writes docs/launch/_raw/stranger-*.json.
 *
 * Run: pnpm launch:stranger
 * Skip browser: STRANGER_SKIP_BROWSER=1
 */
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

/** Soft step: recorded but does not abort (browser smoke). */
function note(step: string, ok: boolean, detail?: unknown) {
  steps.push({ step, ok, detail });
  console.log(`${ok ? "OK" : "SOFT"}  ${step}`);
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

// 2) Ops approve + admin invite over HTTP (services/id platform route)
if (!process.env.PLATFORM_BOOTSTRAP_SECRET?.trim()) {
  process.env.PLATFORM_BOOTSTRAP_SECRET = "stranger-test-platform-secret";
}
const { app: idApp } = await import("../../id/src/app.ts");
const approveRes = await idApp.request(
  `/v1/id/platform/access-requests/${encodeURIComponent(requestId!)}/approve`,
  {
    method: "POST",
    headers: { "x-platform-secret": process.env.PLATFORM_BOOTSTRAP_SECRET },
  },
);
const approveBody = (await approveRes.json().catch(() => ({}))) as {
  organization_id?: string;
  slug?: string;
  invite_url?: string | null;
  invitation_id?: string | null;
  email_delivered?: boolean;
  message?: string;
  error?: string;
};
record("ops-approve", approveRes.status === 200 && Boolean(approveBody.organization_id), {
  status: approveRes.status,
  body: approveBody,
});
const organizationId = approveBody.organization_id!;
const slug = approveBody.slug ?? "";
record("ops-invite", Boolean(approveBody.invite_url), {
  invitation_id: approveBody.invitation_id,
  email_delivered: approveBody.email_delivered,
  invite_url_present: Boolean(approveBody.invite_url),
});

// 3) Set password from the invite link (signup-accept). No SQL bypass.
const adminPass = "StrangerAdmin1!";
let cookie = "";
let token = "";
const inviteToken = approveBody.invite_url
  ? new URL(approveBody.invite_url).searchParams.get("token")
  : null;
record("invite-token", Boolean(inviteToken), {
  invite_url_present: Boolean(approveBody.invite_url),
});
{
  const acceptRes = await idApp.request("/v1/id/invitations/signup-accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: inviteToken,
      display_name: "Stranger Admin",
      password: adminPass,
    }),
  });
  const setCookie = acceptRes.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/salanor_session=([^;]+)/);
  const acceptBody = await acceptRes.json().catch(() => ({}));
  record(
    "admin-session",
    acceptRes.status === 200 && Boolean(match),
    {
      via: "signup-accept",
      email: workEmail,
      status: acceptRes.status,
      body: acceptBody,
    },
  );
  token = decodeURIComponent(match![1]);
  cookie = `salanor_session=${token}`;
}

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

// 5) Ingest key via console (checklist writer ticks create_api_key)
const keyRes = await app.request("/v1/console/ingest-keys", {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "stranger" }),
});
const keyBody = (await keyRes.json().catch(() => ({}))) as { secret?: string };
const ingestKey = keyBody.secret ?? "";
record("create-api-key", keyRes.status === 201 && Boolean(ingestKey), {
  status: keyRes.status,
});

// Built-in sandbox test sender signs and seals (unsigned bank ingest stays provisional
// without an org agent key and never creates a trace row).
const sendRes = await app.request("/v1/console/sandbox/test-events", {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ scenario: "routine" }),
});
const sendJson = (await sendRes.json().catch(() => ({}))) as {
  trace_id?: string;
  decision?: { case_id?: string; event_hash?: string; outcome?: string };
  error?: string;
  code?: string;
};
record(
  "ingest-test-event",
  sendRes.status === 200 && Boolean(sendJson.trace_id),
  { status: sendRes.status, body: sendJson },
);

const traceId = sendJson.trace_id ?? "";
{
  const seen = await app.request(`/v1/console/traces/${encodeURIComponent(traceId)}`, {
    headers: { Cookie: cookie },
  });
  const seenBody = (await seen.json().catch(() => ({}))) as {
    events?: Array<{ event_hash?: string | null }>;
  };
  const sealed = (seenBody.events ?? []).some((e) => Boolean(e.event_hash));
  record("see-sealed", seen.status === 200 && sealed, {
    status: seen.status,
    sealed,
  });
}

// 5b) Held scenario + console approve (checklist approve_held)
let heldApprovalId = "";
{
  const heldRes = await app.request("/v1/console/sandbox/test-events", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "held" }),
  });
  const heldJson = (await heldRes.json().catch(() => ({}))) as {
    outcome?: string;
    response?: {
      outcome?: string;
      approval?: { approval_id?: string | null };
    };
    error?: string;
  };
  const outcome = heldJson.outcome ?? heldJson.response?.outcome ?? "";
  heldApprovalId =
    heldJson.response?.approval?.approval_id?.trim() ||
    "";
  record("held-scenario", heldRes.status === 200 && outcome === "hold", {
    status: heldRes.status,
    outcome,
    approval_id: heldApprovalId || null,
    body: heldJson,
  });
  if (!heldApprovalId) {
    const pending = await app.request(
      "/v1/console/approvals?status=pending&environment=sandbox",
      { headers: { Cookie: cookie } },
    );
    const pendingBody = (await pending.json().catch(() => ({}))) as {
      approvals?: Array<{ approval_id?: string }>;
    };
    heldApprovalId = pendingBody.approvals?.[0]?.approval_id ?? "";
    record("held-pending-listed", pending.status === 200 && Boolean(heldApprovalId), {
      status: pending.status,
      approval_id: heldApprovalId,
    });
  } else {
    record("held-pending-listed", true, { approval_id: heldApprovalId, via: "decision" });
  }
  if (heldApprovalId) {
    const detail = await app.request(
      `/v1/console/approvals/${encodeURIComponent(heldApprovalId)}`,
      { headers: { Cookie: cookie } },
    );
    const detailBody = (await detail.json().catch(() => ({}))) as {
      approval?: { approved_view_hash?: string };
    };
    const viewHash = detailBody.approval?.approved_view_hash;
    const approveRes = await app.request(
      `/v1/console/approvals/${encodeURIComponent(heldApprovalId)}/approve`,
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason_code: "within_policy",
          comment: "Stranger test approve of held synthetic case",
          reason: "Stranger test approve of held synthetic case",
          ...(viewHash ? { approved_view_hash: viewHash } : {}),
        }),
      },
    );
    const approveJson = await approveRes.json().catch(() => ({}));
    record("held-approve", approveRes.status === 200, {
      status: approveRes.status,
      body: approveJson,
    });
  }
}

// 6) Download evidence bundle + verify offline (hard gate)
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
  record("evidence-bundle", res.status === 200, {
    status: res.status,
    body: typeof body === "string" ? body.slice(0, 500) : body,
  });
  const bundlePath = resolve(outDir, `stranger-bundle-${stamp}.json`);
  writeFileSync(
    bundlePath,
    typeof body === "string" ? body : JSON.stringify(body, null, 2),
  );
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

// 8) Membership invite (auditor role) — same HTTP path as console Members
{
  const res = await idApp.request(
    `/v1/id/orgs/${encodeURIComponent(organizationId)}/invitations`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `auditor.member.${Date.now()}@example-bank.test`,
        role: "auditor",
      }),
    },
  );
  const body = await res.json().catch(() => ({}));
  record("auditor-membership-invite", res.status === 200, { status: res.status, body });
}

{
  const res = await app.request("/v1/console/sandbox/status", {
    headers: { Cookie: cookie },
  });
  const body = (await res.json().catch(() => ({}))) as {
    checklist?: Record<string, boolean>;
  };
  const flags = body.checklist ?? {};
  record(
    "checklist-auto-ticks",
    res.status === 200 &&
      flags.create_api_key === true &&
      flags.send_first_event === true &&
      flags.see_sealed === true &&
      flags.approve_held === true &&
      flags.verify_bundle === true &&
      flags.invite_colleague === true,
    { status: res.status, checklist: flags },
  );
}

// 8b) Reset sandbox — empty again, checklist back to start (repeatability)
{
  const resetRes = await app.request("/v1/console/sandbox/reset", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ confirm_name: "RESET SANDBOX" }),
  });
  const resetBody = await resetRes.json().catch(() => ({}));
  record("sandbox-reset", resetRes.status === 200, {
    status: resetRes.status,
    body: resetBody,
  });
  const after = await app.request("/v1/console/sandbox/status", {
    headers: { Cookie: cookie },
  });
  const afterBody = (await after.json().catch(() => ({}))) as {
    checklist?: Record<string, boolean>;
  };
  const flags = afterBody.checklist ?? {};
  const cleared =
    !flags.create_api_key &&
    !flags.send_first_event &&
    !flags.see_sealed &&
    !flags.approve_held &&
    !flags.verify_bundle &&
    !flags.invite_colleague;
  record("sandbox-reset-checklist-cleared", after.status === 200 && cleared, {
    checklist: flags,
  });
  // Refuse reset on a non-sandbox would be covered unit-side; re-seed for browser smoke.
  const seed = await app.request("/v1/console/sandbox/test-events", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "held" }),
  });
  record("sandbox-reseed-after-reset", seed.status === 200, {
    status: seed.status,
  });
}

// 9) Chromium smoke through console (optional; API path above is the release gate)
if (process.env.STRANGER_SKIP_BROWSER?.trim() === "1") {
  steps.push({
    step: "chromium-console",
    ok: true,
    detail: "skipped — STRANGER_SKIP_BROWSER=1",
  });
  console.log("OK  chromium-console — skipped");
} else {
  const { serve } = await import("@hono/node-server");
  const { spawn } = await import("node:child_process");
  const apiPort = 18_180 + (process.pid % 50);
  const idPort = 18_280 + (process.pid % 50);
  const consolePort = 18_380 + (process.pid % 50);
  const apiServer = serve({ fetch: app.fetch, port: apiPort, hostname: "127.0.0.1" });
  const idServer = serve({ fetch: idApp.fetch, port: idPort, hostname: "127.0.0.1" });
  await new Promise((r) => setTimeout(r, 200));
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const idBase = `http://127.0.0.1:${idPort}`;

  let consoleProc: ReturnType<typeof spawn> | null = null;
  let consoleUrl = process.env.CONSOLE_URL?.trim() || "";
  const mediaDir = resolve(outDir, `stranger-browser-${stamp}`);
  mkdirSync(mediaDir, { recursive: true });

  async function consoleReady(url: string): Promise<boolean> {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/aegis/get-started`, {
        signal: AbortSignal.timeout(5_000),
        redirect: "manual",
      });
      if (res.status >= 500 || res.status === 0) return false;
      const text = await res.text().catch(() => "");
      return /salanor|aegis|loading/i.test(text) || res.status < 500;
    } catch {
      return false;
    }
  }

  if (!consoleUrl || !(await consoleReady(consoleUrl))) {
    consoleUrl = `http://127.0.0.1:${consolePort}`;
    consoleProc = spawn(
      "pnpm",
      ["--filter", "@salanor/web-console", "exec", "next", "dev", "--port", String(consolePort)],
      {
        cwd: root,
        env: {
          ...process.env,
          AEGIS_API_URL: apiBase,
          SALANOR_ID_URL: idBase,
          PORT: String(consolePort),
        },
        shell: true,
        stdio: "ignore",
      },
    );
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (await consoleReady(consoleUrl)) {
        await new Promise((r) => setTimeout(r, 2_000));
        break;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }

  try {
    const browsersPath = resolve(root, ".tools/playwright");
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(browsersPath)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
    }
    const { createRequire } = await import("node:module");
    const require = createRequire(resolve(root, "package.json"));
    const { chromium } = require("playwright") as typeof import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      recordVideo: { dir: mediaDir, size: { width: 1280, height: 720 } },
    });
    await context.addCookies([
      {
        name: "salanor_session",
        value: token,
        url: consoleUrl.replace(/\/$/, ""),
      },
    ]);
    const page = await context.newPage();
    const shots: string[] = [];

    async function shot(name: string) {
      const path = resolve(mediaDir, `${name}.png`);
      await page.screenshot({ path, fullPage: true });
      shots.push(path);
    }

    const api = await context.request.get(`${apiBase}/v1/console/sandbox/status`, {
      headers: { Cookie: cookie },
    });
    note("playwright-request-checklist", api.ok(), {
      status: api.status(),
      body: await api.json().catch(() => ({})),
    });

    const ready = await consoleReady(consoleUrl);
    if (!ready) {
      note("chromium-console", false, {
        consoleUrl,
        reason: "console_unreachable",
      });
    } else {
      // Warm the Next compile so screenshots are not stuck on "Loading…".
      async function gotoConsole(path: string) {
        const url = `${consoleUrl.replace(/\/$/, "")}${path}`;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
            return;
          } catch (err) {
            if (attempt === 2) throw err;
            await new Promise((r) => setTimeout(r, 2_000));
          }
        }
      }

      await gotoConsole("/aegis/get-started");
      await page
        .waitForFunction(
          () => !/^\s*Loading/i.test(document.body?.innerText ?? ""),
          null,
          { timeout: 120_000 },
        )
        .catch(() => undefined);
      await page.waitForTimeout(1_500);
      await shot("01-get-started");

      // Ledger for sandbox tenants is the Sandbox environment switch.
      await page.evaluate(() => {
        window.localStorage.setItem("salanor.console.environment", "sandbox");
        window.dispatchEvent(
          new CustomEvent("salanor:console-environment", { detail: "sandbox" }),
        );
      });

      // Fresh held case for the UI approve path (API already approved the first).
      await context.request.post(`${apiBase}/v1/console/sandbox/test-events`, {
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        data: { scenario: "held" },
      });

      await gotoConsole("/aegis/approvals");
      await page.evaluate(() => {
        window.localStorage.setItem("salanor.console.environment", "sandbox");
        window.dispatchEvent(
          new CustomEvent("salanor:console-environment", { detail: "sandbox" }),
        );
      });
      const sandboxEnv = page.getByRole("button", { name: /^Sandbox$/i }).first();
      if (await sandboxEnv.isVisible().catch(() => false)) {
        await sandboxEnv.click().catch(() => undefined);
      }
      await page.waitForTimeout(2_000);
      await page
        .waitForFunction(
          () => !/^\s*Loading/i.test(document.body?.innerText ?? ""),
          null,
          { timeout: 120_000 },
        )
        .catch(() => undefined);
      // Accessible name is "Approve <case title>", not exactly "Approve".
      const approveBtn = page.getByRole("button", { name: /^Approve\b/i }).first();
      await approveBtn.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(1_000);
      await shot("02-approvals");

      if (await approveBtn.isVisible().catch(() => false)) {
        await approveBtn.click();
        const reason = page.locator("textarea").first();
        if (await reason.isVisible().catch(() => false)) {
          await reason.fill("Stranger Chromium approve");
        }
        const confirm = page.getByRole("button", { name: /^Confirm$/i }).first();
        if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await confirm.click();
        }
        await page
          .getByText(/waiting|no approvals|decided|approved/i)
          .first()
          .waitFor({ timeout: 15_000 })
          .catch(() => undefined);
        await page.waitForTimeout(1_500);
        await shot("03-after-approve");
      } else {
        await shot("03-approvals-no-button");
      }

      await gotoConsole("/aegis/traces");
      await page
        .waitForFunction(
          () => !/^\s*Loading/i.test(document.body?.innerText ?? ""),
          null,
          { timeout: 120_000 },
        )
        .catch(() => undefined);
      await page.waitForTimeout(1_500);
      await shot("04-cases");

      const bodyText = await page.locator("body").innerText().catch(() => "");
      note("chromium-console", !/^\s*Loading/i.test(bodyText), {
        consoleUrl,
        shots,
        video_dir: mediaDir,
        held_approval_id: heldApprovalId || null,
        body_preview: bodyText.slice(0, 400),
      });
      writeFileSync(
        resolve(outDir, `stranger-browser-${stamp}.json`),
        JSON.stringify(
          {
            ok: !/^\s*Loading/i.test(bodyText),
            consoleUrl,
            shots,
            video_dir: mediaDir,
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      writeFileSync(
        resolve(outDir, "stranger-browser-latest.json"),
        JSON.stringify(
          {
            ok: !/^\s*Loading/i.test(bodyText),
            consoleUrl,
            shots,
            video_dir: mediaDir,
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    }

    await context.close();
    await browser.close();
  } catch (err) {
    note("chromium-console", false, {
      playwright_error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    consoleProc?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    (apiServer as { close?: () => void }).close?.();
  } catch {
    /* ignore */
  }
  try {
    (idServer as { close?: () => void }).close?.();
  } catch {
    /* ignore */
  }
}

const CRITICAL = new Set([
  "access-request",
  "access-request-persisted",
  "ops-approve",
  "ops-invite",
  "invite-token",
  "admin-session",
  "checklist-status",
  "create-api-key",
  "ingest-test-event",
  "see-sealed",
  "held-scenario",
  "held-approve",
  "evidence-bundle",
  "aegis-verify",
  "auditor-portal-invite",
  "auditor-membership-invite",
  "checklist-auto-ticks",
  "sandbox-reset",
  "sandbox-reset-checklist-cleared",
  "sandbox-reseed-after-reset",
]);

const byStep = new Map(steps.map((s) => [s.step, s]));
const missingCritical = [...CRITICAL].filter((name) => !byStep.has(name));
const failedCritical = [...CRITICAL].filter((name) => byStep.get(name)?.ok !== true);
const allCriticalOk = missingCritical.length === 0 && failedCritical.length === 0;
if (!allCriticalOk) {
  console.error("Critical steps missing or failed:", {
    missing: missingCritical,
    failed: failedCritical,
  });
}

writeArtifact(allCriticalOk);
await closePool();
process.exit(allCriticalOk ? 0 : 1);
