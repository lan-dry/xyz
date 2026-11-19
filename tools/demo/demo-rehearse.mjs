#!/usr/bin/env node
/**
 * Headless rehearsal of the Demo Bank walkthrough (docs/DEMO.md) against a NORMAL, running local
 * API with real timers. Prints PASS/FAIL per step; exits non-zero if any step fails.
 *
 * There is no demo mode, no demo clock and no /v1/aegis/demo/* route. Every step goes through
 * the same public surface as production:
 *   - cases:      signed via LOS Aegis Connector → POST /v1/aegis/source-events
 *                 (bank-simulator story defs), then POST /v1/aegis/approvals/request
 *                 for holds and hard stops
 *   - decisions:  console approve / reject / release, signed in as the real personas through
 *                 Salanor ID (the officer is refused, the manager and the Head of Compliance
 *                 decide)
 *   - scratch org: the disposable is_demo tenant slug "demo-bank-rehearsal" is wiped
 *                 (pilot:wipe-tenant) and re-provisioned (pilot:provision-demo-tenant) before
 *                 every run, with its own personas (*@rehearsal.test) and its own throwaway
 *                 ingest key. The presenting org (demo-bank) is never touched.
 *
 * Needs (shell or .env unless noted):
 *   Persona passwords are generated into .demo-tenant-rehearsal.local.json (gitignored).
 *   PLATFORM_BOOTSTRAP_SECRET      the LOCAL Salanor ID's provisioning secret
 *   AEGIS_ALLOW_TENANT_WIPE=1      in YOUR SHELL (an .env file cannot supply it): lets the wipe run
 *   a running local stack:         pnpm demo:up (API :8080, ID :8091, local Postgres)
 *
 * Refuses to run in production, and against any non-loopback API / ID / database.
 *
 * Flags / env:
 *   --with-escalation        also wait the REAL 2-minute escalation window (adds ~2m15s);
 *                            ESCALATION_WAIT_MS overrides the wait. Standalone version:
 *                            pnpm demo:prove-escalation-2min
 *   AEGIS_API_BASE           default http://127.0.0.1:8080
 *   SALANOR_ID_URL           default http://127.0.0.1:8091
 *   DEMO_DATABASE_URL        local Postgres, default postgresql://salanor:salanor@127.0.0.1:5435/aegis
 *
 * Not covered here (need a person or the simulator UI): the delegation stories (grant a
 * delegation on the console's Delegations page first) and the "Aegis unreachable" replay (the
 * simulator's toggle). Use `pnpm bank-simulator`, or `pnpm demo:runbook-walk` for screenshots.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLUG = "demo-bank-rehearsal";
const TENANT_FILE = ".demo-tenant-rehearsal.local.json"; // gitignored: .demo-tenant-*.local.json
const ALLOW_WIPE_ENV = "AEGIS_ALLOW_TENANT_WIPE";

// Operator's own shell value, captured before .env is merged in (an .env file cannot authorise a wipe).
const shellAllowWipe = process.env[ALLOW_WIPE_ENV];

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const envPath = join(root, name);
    if (!existsSync(envPath)) continue;
    let text = readFileSync(envPath, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
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
}

function die(message, code = 2) {
  console.error(`\n  demo:rehearse: ${message}\n`);
  process.exit(code);
}

function isLoopbackUrl(raw) {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/** Run a pnpm command, echo output, return it (to read the organisation id). */
function pnpmCapture(args, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", args, {
      cwd: root,
      shell: true,
      env: { ...process.env, ...env },
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
      code === 0
        ? resolvePromise(out)
        : reject(new Error(`pnpm ${args.join(" ")} exited ${code}`)),
    );
  });
}

let failed = 0;
function step(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  return { status: res.status, data: data ?? {}, headers: res.headers };
}

async function main() {
  loadDotEnv();
  if (shellAllowWipe === undefined) delete process.env[ALLOW_WIPE_ENV];
  const legacyFlag = ""; // removed: ignored if still set in an old shell
  if (process.env[legacyFlag] !== undefined) {
    console.warn(`${legacyFlag} is no longer used; ignoring it.`);
    delete process.env[legacyFlag];
  }
  const withEscalation =
    process.argv.slice(2).includes("--with-escalation") ||
    process.env.REHEARSE_ESCALATION === "1";

  if (process.env.NODE_ENV === "production" || process.env.AEGIS_ENV === "production") {
    die("refusing to run with NODE_ENV/AEGIS_ENV=production.");
  }

  const password = `rehearse-${randomBytes(12).toString("base64url")}`;
  if (!process.env.PLATFORM_BOOTSTRAP_SECRET?.trim()) {
    die("PLATFORM_BOOTSTRAP_SECRET is not set (shell or .env): the local Salanor ID needs it to provision the scratch org.");
  }
  if (shellAllowWipe?.trim() !== "1") {
    die(
      `the scratch org "${SLUG}" is wiped before each run, which needs ${ALLOW_WIPE_ENV}=1 in your shell ` +
        `(an .env file cannot supply it).\n  PowerShell:  $env:${ALLOW_WIPE_ENV} = "1"`,
    );
  }

  const apiBase = (process.env.AEGIS_API_BASE?.trim() || "http://127.0.0.1:8080").replace(/\/+$/, "");
  const idBase = (process.env.SALANOR_ID_URL?.trim() || "http://127.0.0.1:8091").replace(/\/+$/, "");
  const dbUrl =
    process.env.DEMO_DATABASE_URL?.trim() ||
    "postgresql://salanor:salanor@127.0.0.1:5435/aegis";
  if (!isLoopbackUrl(apiBase) || !isLoopbackUrl(idBase) || !isLoopbackUrl(dbUrl.replace(/^postgres(ql)?:/i, "http:"))) {
    die(
      `demo:rehearse wipes and re-provisions "${SLUG}", so it only runs against a local stack ` +
        `(API ${apiBase}, ID ${idBase}, DB must all be loopback). Start one with: pnpm demo:up`,
    );
  }

  // 1. API reachable. Fail fast with a pointer to demo:up.
  {
    const res = await fetch(`${apiBase}/health`).catch(() => null);
    if (!step("API reachable", Boolean(res && res.status < 500), `http=${res?.status ?? "no response"}`)) {
      die("the API is not running. Start the local stack first: pnpm demo:up", 1);
    }
    const id = await fetch(`${idBase}/health`).catch(() => null);
    if (!step("Salanor ID reachable", Boolean(id && id.status < 500), `http=${id?.status ?? "no response"}`)) {
      die("Salanor ID is not running. Start the local stack first: pnpm demo:up", 1);
    }
  }

  // 2. Scratch org: own tenant file (distinct personas), own throwaway ingest key.
  const ingestKey = `aegis_${randomBytes(24).toString("hex")}`;
  const personaDefs = {
    admin: "Rehearsal Admin",
    officer: "Rehearsal Credit Officer",
    manager: "Rehearsal Credit Manager",
    compliance: "Rehearsal Compliance Officer",
    head: "Rehearsal Head of Compliance",
    dpo: "Rehearsal DPO",
    deputy: "Rehearsal Deputy",
  };
  const personas = {};
  for (const [key, display_name] of Object.entries(personaDefs)) {
    personas[key] = { email: `${key}@rehearsal.test`, display_name, password };
  }
  const tenantPath = join(root, TENANT_FILE);
  writeFileSync(
    tenantPath,
    `${JSON.stringify(
      {
        api_base: apiBase,
        id_base: idBase,
        console_origin: "http://localhost:3000",
        organization: { name: "Demo Bank Rehearsal", slug: SLUG },
        personas,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  const toolEnv = {
    DEMO_TENANT_FILE: tenantPath,
    DEMO_BANK_INGEST_KEY: ingestKey,
    AEGIS_INGEST_KEY: ingestKey,
    MIGRATION_DATABASE_URL: dbUrl, // local owner role; the wipe function is owner-only
    [ALLOW_WIPE_ENV]: "1",
  };

  console.log(`\n== scratch org "${SLUG}" (pilot:wipe-tenant -> pilot:provision-demo-tenant) ==`);
  let orgId = "";
  try {
    await pnpmCapture(
      ["pilot:wipe-tenant", "--slug", SLUG, "--confirm", SLUG, "--allow-missing"],
      toolEnv,
    );
    const out = await pnpmCapture(["pilot:provision-demo-tenant"], toolEnv);
    orgId = out.match(/Organisation id:\s*([0-9a-f-]{36})/i)?.[1] ?? "";
  } catch (err) {
    step("scratch org wiped and provisioned", false, err instanceof Error ? err.message : String(err));
    die("could not prepare the scratch org (see output above).", 1);
  }
  if (!step("scratch org wiped and provisioned", Boolean(orgId), orgId || "no organisation id in the output")) {
    process.exit(1);
  }
  console.log("");

  // 3. Personas sign in through Salanor ID, exactly like the console does.
  async function login(key) {
    const res = await json(`${idBase}/v1/id/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: personas[key].email,
        password,
        organization_id: orgId,
      }),
    });
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .find((c) => c.startsWith("salanor_session="));
    if (res.status !== 200 || !cookie) return null;
    return cookie;
  }
  const sessions = {};
  for (const key of ["admin", "officer", "manager", "head"]) {
    sessions[key] = await login(key);
    step(`sign in as ${key}`, Boolean(sessions[key]), personas[key].email);
  }
  if (!sessions.admin) die("the scratch admin could not sign in; cannot continue.", 1);

  const consoleCall = (who, path, method = "GET", body) =>
    json(`${apiBase}/v1/console${path}`, {
      method,
      headers: {
        Cookie: sessions[who] ?? "",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  const agentsRes = await consoleCall("admin", "/agents");
  const agentId = (slug) =>
    (agentsRes.data.agents ?? []).find((a) => a.slug === slug)?.agent_id;
  step("agents provisioned", ["credit-decision", "payments-gateway", "customer-data", "core-banking"].every(agentId));

  // 4. Stories: bank-simulator definitions, signed through the LOS Connector (Stage 1b).
  const { STORIES, getStory } = await import(
    pathToFileURL(join(root, "tools", "bank-simulator", "stories.mjs")).href
  );
  step("bank-simulator stories loaded", Array.isArray(STORIES) && STORIES.length > 0, `${STORIES.length} stories`);

  const { RealConnectors } = await import(
    pathToFileURL(join(root, "tools", "bank-simulator", "real-connectors.mjs")).href
  );
  const losConnectors = new RealConnectors(join(root, ".data", "connectors-rehearsal"), {
    apiBase,
    ingestKey,
    localStateOnly: true, // scratch org — own seq space; still uses provisioned private key
  });
  await losConnectors.init();
  step("LOS Connector ready", true, "src_los");

  async function runStory(storyId) {
    const story = getStory(storyId);
    if (!story) {
      step(`story ${storyId}`, false, "unknown story id");
      return null;
    }
    const suffix = randomBytes(5).toString("hex");
    const caseId = `REH-${suffix.toUpperCase()}`;
    const traceId = `tr_reh_${suffix}`;
    const idem = randomUUID(); // AEGIS-SRC1 requires a UUID idempotency_key
    const eventBody = {
      schema_version: 1,
      case_id: caseId,
      idempotency_key: idem,
      event_type: story.event_type,
      product: story.product,
      agent_id: agentId(story.agent_slug),
      emitted_at: new Date().toISOString(),
      actor: { type: "system", id: story.agent_slug },
      attributes: story.attributes,
      trace_id: traceId,
    };
    let intake;
    try {
      intake = await losConnectors.submit("los", eventBody);
    } catch (err) {
      step(
        `story ${story.id}`,
        false,
        `connector: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    if (intake.status !== 200) {
      step(`story ${story.id}`, false, `intake http=${intake.status} ${intake.data?.error ?? ""}`);
      return null;
    }
    const decision = intake.data;
    const sealed = Boolean(decision.event_id) && !String(decision.event_id).startsWith("evt_gov_");
    let approvalId = decision.approval_id ?? null;
    if ((decision.outcome === "hold" || decision.outcome === "stop") && sealed && !approvalId) {
      const req = await json(`${apiBase}/v1/aegis/approvals/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ingestKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: orgId,
          event_id: decision.event_id,
          trace_id: traceId,
          tool_name: "governed.action",
          deferred: { url: "https://example.test/demo-callback", method: "POST" },
        }),
      });
      approvalId = req.data.approval_id ?? null;
    }
    const outcomeOk = decision.outcome === story.expect;
    step(
      `story ${story.id}: ${story.expect}`,
      outcomeOk,
      `outcome=${decision.outcome}${approvalId ? ` approval=${approvalId}` : ""}`,
    );
    return { story, decision, caseId, traceId, approvalId, outcomeOk };
  }

  const decisionBody = (code, reason) => ({ reason_code: code, reason, comment: reason });
  const decided = []; // approval ids that must show up in approval history

  // Allowed automatically (no human approval).
  const allowed = await runStory("loan_within_limit");
  step("allowed case needs no approval", allowed != null && !allowed.approvalId);
  await runStory("kyc_data_access");

  // Held: the officer is refused, the manager approves.
  const held = await runStory("loan_needs_manager");
  if (held?.approvalId) {
    const refused = await consoleCall(
      "officer",
      `/approvals/${encodeURIComponent(held.approvalId)}/approve`,
      "POST",
      decisionBody("OFFICER_ATTEMPT", "Officer attempting own-band approval"),
    );
    step("officer cannot approve a manager-band case", refused.status === 403, `http=${refused.status}`);
    const ok = await consoleCall(
      "manager",
      `/approvals/${encodeURIComponent(held.approvalId)}/approve`,
      "POST",
      decisionBody("WITHIN_BAND", "Income and collateral reviewed"),
    );
    step("manager approves", ok.status === 200, `http=${ok.status} ${ok.data.error ?? ok.data.code ?? ""}`);
    if (ok.status === 200) decided.push(held.approvalId);
  } else {
    step("held case raised an approval", false, "no approval id (is AEGIS_BRIDGE_MASTER_KEY set so the case is sealed?)");
  }

  // Held: the manager declines.
  const declined = await runStory("loan_large_decline");
  if (declined?.approvalId) {
    const res = await consoleCall(
      "manager",
      `/approvals/${encodeURIComponent(declined.approvalId)}/reject`,
      "POST",
      decisionBody("WEAK_COLLATERAL", "Collateral does not cover the exposure"),
    );
    step("manager declines", res.status === 200, `http=${res.status} ${res.data.error ?? res.data.code ?? ""}`);
    if (res.status === 200) decided.push(declined.approvalId);
  }

  // Held: the model override needs the Head of Compliance.
  const override = await runStory("model_override");
  if (override?.approvalId) {
    const res = await consoleCall(
      "head",
      `/approvals/${encodeURIComponent(override.approvalId)}/approve`,
      "POST",
      decisionBody("OVERRIDE_JUSTIFIED", "Override reviewed against the risk model recommendation"),
    );
    step("head of compliance approves the override", res.status === 200, `http=${res.status} ${res.data.error ?? res.data.code ?? ""}`);
    if (res.status === 200) decided.push(override.approvalId);
  }

  // Held (PAY-03): approve is refused until the callback is verified; declining is allowed.
  const payment = await runStory("payment_callback_unverified");
  if (payment?.approvalId) {
    const refused = await consoleCall(
      "manager",
      `/approvals/${encodeURIComponent(payment.approvalId)}/approve`,
      "POST",
      decisionBody("WITHIN_BAND", "Attempt before the callback is verified"),
    );
    step("approve refused while the payment callback is unverified", refused.status >= 400, `http=${refused.status}`);
    const res = await consoleCall(
      "manager",
      `/approvals/${encodeURIComponent(payment.approvalId)}/reject`,
      "POST",
      decisionBody("CALLBACK_UNVERIFIED", "Beneficiary bank callback not verified"),
    );
    step("manager declines the unverified payment", res.status === 200, `http=${res.status} ${res.data.error ?? res.data.code ?? ""}`);
    if (res.status === 200) decided.push(payment.approvalId);
  }

  // Hard stop: the manager cannot release, the Head of Compliance can.
  const stop = await runStory("sanctions_pep_stop");
  if (stop?.approvalId) {
    const mgr = await consoleCall(
      "manager",
      `/approvals/${encodeURIComponent(stop.approvalId)}/release`,
      "POST",
      decisionBody("REVIEWED", "Manager tries to release a hard stop"),
    );
    step("manager cannot release a hard stop", mgr.status >= 400, `http=${mgr.status}`);
    const rel = await consoleCall(
      "head",
      `/approvals/${encodeURIComponent(stop.approvalId)}/release`,
      "POST",
      decisionBody("FALSE_POSITIVE", "Name match cleared after enhanced due diligence"),
    );
    step("head of compliance releases the hard stop", rel.status === 200, `http=${rel.status} ${rel.data.error ?? rel.data.code ?? ""}`);
    if (rel.status === 200) decided.push(stop.approvalId);
  }

  // Wrong ingest key: refused with 401, nothing recorded.
  {
    const wrong = getStory("wrong_key");
    const res = await json(`${apiBase}/v1/aegis/governed/events`, {
      method: "POST",
      headers: {
        Authorization: "Bearer aegis_0000000000000000000000000000000000000000deadbeef",
        "Content-Type": "application/json",
        "Idempotency-Key": `reh-wrong-key-${randomBytes(4).toString("hex")}`,
      },
      body: JSON.stringify({
        schema_version: 1,
        case_id: `REH-BADKEY-${randomBytes(3).toString("hex").toUpperCase()}`,
        event_type: wrong.event_type,
        product: wrong.product,
        emitted_at: new Date().toISOString(),
        actor: { type: "system", id: wrong.agent_slug },
        attributes: wrong.attributes,
      }),
    });
    step("wrong ingest key is refused", res.status === 401, `http=${res.status}`);
  }

  // Everything decided above is now in the approvals history.
  {
    const hist = await consoleCall("admin", "/approvals?status=history&limit=100");
    const seen = new Set((hist.data.approvals ?? []).map((a) => a.approval_id));
    const missing = decided.filter((id) => !seen.has(id));
    step(
      "decisions recorded in approvals history",
      hist.status === 200 && decided.length > 0 && missing.length === 0,
      `${decided.length - missing.length}/${decided.length} found`,
    );
  }

  // Optional: real 2-minute escalation (tenant configuration on the held loan rules).
  if (withEscalation) {
    const esc = await runStory("escalation_time_limit");
    if (esc?.approvalId) {
      const waitMs = Number(process.env.ESCALATION_WAIT_MS || 2 * 60_000 + 15_000);
      console.log(`      waiting ${Math.round(waitMs / 1000)}s of real time for the escalation window…`);
      await sleep(waitMs);
      // Listing pending approvals runs expire + escalate.
      await consoleCall("admin", "/approvals?status=pending");
      const detail = await consoleCall("admin", `/approvals/${encodeURIComponent(esc.approvalId)}`);
      const meta = detail.data.approval?.metadata ?? detail.data.metadata ?? {};
      const at = meta.escalated_to_role_at ?? meta.escalated_at ?? null;
      step(
        "held case escalated after the real 2-minute window",
        Boolean(at),
        at ? `to ${meta.escalate_to_role ?? meta.escalated_to_role ?? "?"} at ${at}` : "no escalation recorded",
      );
    } else {
      step("escalation case raised an approval", false);
    }
  } else {
    console.log("SKIP  real-timer escalation (add --with-escalation, or run pnpm demo:prove-escalation-2min)");
  }

  await losConnectors.close().catch(() => undefined);
  console.log(`\nrehearse done — failed=${failed}  (scratch org ${SLUG} = ${orgId}; demo-bank untouched)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
