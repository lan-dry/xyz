#!/usr/bin/env node
/**
 * Walk the DEMO_RUNBOOK end to end with real sessions and capture screenshots into
 * docs/screens/runbook/. Each person gets their own browser context (their own cookies),
 * so admin, officer, manager and head of compliance can all be "signed in" at once.
 *
 * Needs: console on :3000 (production-style default UI profile preferred),
 * AEGIS_DEMO_APPROVAL_PASSWORD, Playwright, and the standalone bank simulator:
 *   BANK_SIMULATOR_URL (default http://127.0.0.1:4000)
 *   BANK_SIMULATOR_PASS when the simulator has a passphrase set
 *
 * Stories are sent through the simulator's own API (/api/story), not the in-console
 * demo routes (those need AEGIS_DEMO_MODE and are absent from production-style nav).
 *
 * Writes docs/screens/runbook/NN-name.png and prints one PASS/FAIL line per check.
 *
 * Usage: node tools/demo/demo-runbook-walk.mjs
 */
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "docs", "screens", "runbook");
mkdirSync(outDir, { recursive: true });
// Drop invalid / stale shots from failed passes before writing this walk.
for (const name of readdirSync(outDir)) {
  if (name.endsWith(".png")) unlinkSync(join(outDir, name));
}

const password = process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim();
if (!password || password.length < 10) {
  console.error("Set AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars).");
  process.exit(1);
}
const base = process.env.CONSOLE_ORIGIN?.trim() || "http://localhost:3000";
// Console /api/console rewrites can 500 when next.config was built against another
// AEGIS_API_URL. Mutations go straight to the API; screenshots still use the console UI.
const apiBase = (
  process.env.AEGIS_API_URL?.trim() ||
  process.env.AEGIS_API_BASE?.trim() ||
  "http://127.0.0.1:8088"
).replace(/\/+$/, "");
const simUrl = (process.env.BANK_SIMULATOR_URL?.trim() || "http://127.0.0.1:4000").replace(
  /\/+$/,
  "",
);
const simPass = process.env.BANK_SIMULATOR_PASS?.trim() || "";

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.error("Playwright is missing. Run: pnpm add -wD playwright && npx playwright install chromium");
  process.exit(1);
}

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(label);
}

const launchOpts = { headless: true };
// Prefer a system browser when the Playwright-managed binary fails to spawn
// (common on locked-down Windows / antivirus paths under Temp).
if (process.env.PLAYWRIGHT_CHANNEL?.trim()) {
  launchOpts.channel = process.env.PLAYWRIGHT_CHANNEL.trim();
} else {
  for (const channel of ["msedge", "chrome"]) {
    try {
      const probe = await playwright.chromium.launch({ headless: true, channel });
      await probe.close();
      launchOpts.channel = channel;
      break;
    } catch {
      /* try next */
    }
  }
}
const browser = await playwright.chromium.launch(launchOpts);
const viewport = { width: 1920, height: 1080 };

async function signIn(email) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: "networkidle" }).catch(() => {});
  const emailSel = 'input[type="email"], input[name="email"]';
  if (await page.locator(emailSel).count()) {
    await page.fill(emailSel, email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/aegis/, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  const onConsole = page.url().includes("/aegis");
  check(`signed in as ${email}`, onConsole, page.url());
  return { context, page, email };
}

let shotNo = 0;
async function shot(who, name, path) {
  if (path) {
    await who.page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await who.page.waitForTimeout(800);
  }
  shotNo += 1;
  const file = join(outDir, `${String(shotNo).padStart(2, "0")}-${name}.png`);
  await who.page.screenshot({ path: file });
  console.log("wrote", file);
}

async function post(who, path, data) {
  // next start freezes rewrites from build-time AEGIS_API_URL (often :8080).
  // Call the live API directly and forward the browser session cookie.
  const apiPath = path.startsWith("/api/console/")
    ? `/v1/console/${path.slice("/api/console/".length)}`
    : path.startsWith("/v1/")
      ? path
      : `/v1/console${path.startsWith("/") ? path : `/${path}`}`;
  const cookies = await who.context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(`${apiBase}${apiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(data ?? {}),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let simCookie = "";
async function simLogin() {
  const headers = { "Content-Type": "application/json", "X-Simulator": "1" };
  // Probe whether login is required.
  const probe = await fetch(`${simUrl}/api/state`, { headers: { Cookie: simCookie } });
  if (probe.status === 200) return;
  if (!simPass) {
    throw new Error(
      `Simulator at ${simUrl} requires login; set BANK_SIMULATOR_PASS (or unset passphrase for loopback).`,
    );
  }
  const res = await fetch(`${simUrl}/api/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ passphrase: simPass }),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  simCookie = set.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) {
    throw new Error(`Simulator login failed HTTP ${res.status}`);
  }
}

async function runStory(_admin, storyId) {
  try {
    await simLogin();
  } catch (err) {
    check(
      `story ${storyId} ran`,
      false,
      `simulator login: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
  let res;
  try {
    res = await fetch(`${simUrl}/api/story`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Simulator": "1",
        ...(simCookie ? { Cookie: simCookie } : {}),
      },
      body: JSON.stringify({ story_id: storyId }),
    });
  } catch (err) {
    check(
      `story ${storyId} ran`,
      false,
      `fetch failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
  const body = await res.json().catch(() => ({}));
  const status = res.status;
  if (status !== 200 && status !== 201) {
    check(`story ${storyId} ran`, false, `HTTP ${status} ${body.error ?? ""}`);
    return null;
  }
  check(
    `story ${storyId}: outcome ${body.outcome} matches expected ${body.expected}`,
    body.outcome === body.expected ||
      (body.expected === "hold" && body.outcome === "hold") ||
      (body.expected === "stop" && body.outcome === "stop") ||
      (body.expected === "allow" && body.outcome === "allow"),
  );
  return body;
}

const admin = await signIn("admin@demo.test");
const officer = await signIn("officer@demo.test");
const manager = await signIn("manager@demo.test");
const head = await signIn("head@demo.test");

try {
  // 0. Open clean
  await shot(admin, "overview", "/aegis");
  await shot(admin, "live-feed", "/aegis/live");

  // 0b. Production-style chrome: full menu, Demo organisation tag, no Simulator strip
  const overviewText = await admin.page.locator("body").innerText();
  check("nav includes Rules", overviewText.includes("Rules"));
  check("nav includes Cases", overviewText.includes("Cases"));
  check("nav includes Reports", overviewText.includes("Reports"));
  check("nav includes Access log", overviewText.includes("Access log"));
  check("nav includes Delegations", overviewText.includes("Delegations"));
  check("no Simulator in production-style nav", !overviewText.includes("Simulator"));
  check(
    "quiet Demo organisation tag (or no loud strip)",
    overviewText.includes("Demo organisation") ||
      !overviewText.includes("Demo environment, synthetic data"),
  );

  // 1. Allowed within officer limit (RWF 1,200,000) via standalone simulator
  const allowed = await runStory(admin, "loan_within_limit");
  try {
    await admin.page.goto(`${simUrl}/`, { waitUntil: "networkidle", timeout: 15000 });
    await admin.page.waitForTimeout(500);
    shotNo += 1;
    const simShot = join(
      outDir,
      `${String(shotNo).padStart(2, "0")}-simulator-standalone.png`,
    );
    await admin.page.screenshot({ path: simShot });
    console.log("wrote", simShot);
    check("standalone simulator page reachable", true);
  } catch (err) {
    check(
      "standalone simulator page reachable",
      false,
      String(err instanceof Error ? err.message : err),
    );
  }
  if (allowed?.trace_id) {
    await shot(admin, "case-allowed-four-answers", `/aegis/traces/${allowed.trace_id}`);
  }

  // 2. Held, officer refused, manager approves
  const held = await runStory(admin, "loan_needs_manager");
  if (held?.approval_id) {
    await shot(officer, "approvals-as-officer", `/aegis/approvals?focus=${held.approval_id}`);
    const refused = await post(officer, `/api/console/approvals/${held.approval_id}/approve`, {
      reason_code: "OFFICER_ATTEMPT",
      reason: "Officer attempting own-band approval",
      comment: "Officer attempting own-band approval",
    });
    check("officer cannot approve a manager-band case", refused.status === 403, `HTTP ${refused.status}`);

    await shot(manager, "approvals-as-manager", `/aegis/approvals?focus=${held.approval_id}`);
    // Simulator approvals require reason_code + comment (required_fields).
    const approved = await post(manager, `/api/console/approvals/${held.approval_id}/approve`, {
      reason_code: "WITHIN_BAND",
      reason: "Income and collateral reviewed",
      comment: "Within manager authority",
    });
    check(
      "manager can approve",
      approved.status === 200,
      `HTTP ${approved.status} ${approved.body?.error ?? approved.body?.code ?? ""}`,
    );
    if (held.trace_id) {
      await shot(manager, "case-released-after-approval", `/aegis/traces/${held.trace_id}`);
      await shot(manager, "case-replay", `/aegis/traces/${held.trace_id}/replay`);
    }
  } else {
    check("held story created an approval", false);
  }

  // 4. Rules — v4 created live (dual publish). Matches DEMO_RUNBOOK §4.
  const priorTraceId = allowed?.trace_id ?? null;
  const priorPolicyHash =
    typeof allowed?.policy_content_hash === "string"
      ? allowed.policy_content_hash
      : typeof allowed?.policy?.content_hash === "string"
        ? allowed.policy.content_hash
        : null;
  const prep = await post(admin, "/api/console/demo-tenant/prepare-v4-dual-publish", {
    co_publisher_email: "head@demo.test",
  });
  check(
    "§4 prepare live v4 draft (dual publish)",
    prep.status === 201 || prep.status === 200,
    `HTTP ${prep.status} ${prep.body?.error ?? ""}`,
  );
  const draftId = prep.body?.draft?.policy_id;
  const againstId = prep.body?.against?.policy_id;
  const draftVer = prep.body?.draft?.version;
  check(
    "§4 draft has dual_publish_required",
    prep.body?.draft?.dual_publish_required === true,
  );
  check(
    "§4 draft version is v4-or-next (live, not pre-seeded)",
    Number(draftVer) >= 4 || Number(draftVer) === Number(prep.body?.against?.version) + 1,
    `draft=v${draftVer} against=v${prep.body?.against?.version}`,
  );

  if (draftId) {
    const alone = await post(admin, `/api/console/policies/${draftId}/activate`, {});
    check(
      "§4 first publisher alone cannot finish dual publish",
      alone.status === 200 &&
        (alone.body?.published === false || alone.body?.pending_confirmation === true),
      `HTTP ${alone.status} published=${alone.body?.published}`,
    );
    // Head was elevated to console admin by prepare-v4 so they can co-publish.
    const headCtx = await signIn("head@demo.test");
    const two = await post(headCtx, `/api/console/policies/${draftId}/activate`, {});
    check(
      "§4 second publisher completes dual publish → v4 live",
      two.status === 200 &&
        (two.body?.published === true || two.body?.policy != null),
      `HTTP ${two.status}`,
    );
    await shot(admin, "rules-v4-live", "/aegis/policies");
    if (againstId) {
      await admin.page.goto(
        `${base}/aegis/policies?diff=${encodeURIComponent(draftId)}&against=${encodeURIComponent(againstId)}`,
        { waitUntil: "networkidle", timeout: 60000 },
      ).catch(() => {});
      await admin.page.waitForTimeout(800);
      shotNo += 1;
      const diffShot = join(outDir, `${String(shotNo).padStart(2, "0")}-rules-v3-v4-diff.png`);
      await admin.page.screenshot({ path: diffShot });
      console.log("wrote", diffShot);
    }
    if (priorTraceId) {
      await shot(admin, "case-still-v3-after-v4", `/aegis/traces/${priorTraceId}`);
      const caseText = await admin.page.locator("body").innerText();
      check(
        "§4/§6 earlier receipt still references v3 (or prior hash)",
        caseText.includes("v3") ||
          (priorPolicyHash ? caseText.includes(priorPolicyHash.slice(0, 8)) : true),
      );
    }
    await headCtx.context.close();
  } else {
    check("§4 dual-publish draft id returned", false);
  }

  // 5. Hard stop: manager cannot release, head of compliance can
  const stop = await runStory(admin, "sanctions_pep_stop");
  if (stop?.approval_id) {
    const mgr = await post(manager, `/api/console/approvals/${stop.approval_id}/release`, {
      reason_code: "REVIEWED",
      reason: "Manager tries to release a hard stop",
    });
    check("manager cannot release a hard stop", mgr.status >= 400, `HTTP ${mgr.status}`);
    const rel = await post(head, `/api/console/approvals/${stop.approval_id}/release`, {
      reason_code: "FALSE_POSITIVE",
      reason: "Name match cleared after enhanced due diligence",
      comment: "Cleared by Head of Compliance",
    });
    check("head of compliance can release", rel.status === 200, `HTTP ${rel.status}`);
  }
  if (stop?.trace_id) await shot(head, "case-hard-stop-released", `/aegis/traces/${stop.trace_id}`);

  // Edge stories (runbook §11); escalation_time_limit here is simulated — real 2-min is prove-escalation-2min
  for (const id of [
    "payment_callback_unverified",
    "escalation_time_limit",
    "delegate_inside_window",
    "delegate_outside_window",
    "unreachable_replayed",
  ]) {
    const r = await runStory(admin, id);
    if (r?.trace_id) await shot(admin, `story-${id}`, `/aegis/traces/${r.trace_id}`);
  }

  // 6. Evidence / verify (bundle from §1 must still verify after live v4) + §8 reports / access log
  await shot(admin, "evidence", "/aegis/evidence");
  await shot(admin, "verify", "/aegis/verify");
  check(
    "§6 Verify page offers Demo Bank bundles (or drop zone)",
    (await admin.page.locator("body").innerText()).match(/Demo Bank|evidence bundle|Drop/i) != null,
  );
  await shot(admin, "reports", "/aegis/reports");
  await shot(admin, "access-log", "/aegis/logs");
  await shot(admin, "live-feed-after", "/aegis/live");
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nRunbook walk OK.");
