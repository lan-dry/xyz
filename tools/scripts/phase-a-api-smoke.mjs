/**
 * Phase A API smoke — automates console-adjacent checks (not full UI).
 * Requires: Postgres, bootstrap done, aegis-api :8080, id :8091
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const adminPass = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
if (!adminEmail || !adminPass) {
  console.error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in .env (after db:seed:bootstrap).");
  process.exit(1);
}

const idBase = "http://127.0.0.1:8091/v1/id";
const consoleBase = "http://127.0.0.1:8080/v1/console";

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const joined = raw.join("; ");
  const m = joined.match(/salanor_session=([^;]+)/);
  return m?.[1] ?? "";
}

async function req(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { res, json, cookie: parseCookies(res) };
}

function cookieHeader(token) {
  return { Cookie: `salanor_session=${token}` };
}

function fail(name, detail) {
  console.error(`FAIL ${name} — ${detail}`);
  process.exit(1);
}
function ok(name, detail) {
  console.log(`OK  ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("== Phase A API smoke ==");

const healthApi = await req("http://127.0.0.1:8080/health");
if (!healthApi.res.ok) fail("aegis-api health", healthApi.res.status);
ok("aegis-api health");

const healthId = await req("http://127.0.0.1:8091/health");
if (!healthId.res.ok) fail("id health", healthId.res.status);
ok("id health");

const loginA = await req(`${idBase}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPass }),
});
if (!loginA.res.ok) fail("login", `${loginA.res.status}`);
const cookieA = loginA.cookie;
ok("login", loginA.json.user?.role);

const me = await req(`${idBase}/auth/me`, {
  headers: cookieHeader(cookieA),
});
if (!me.res.ok) fail("auth/me", me.res.status);
const orgId = me.json.organization?.organization_id;
const orgList = me.json.organizations ?? [];

if (orgId) {
  const members = await req(`${idBase}/orgs/${orgId}/members`, {
    headers: cookieHeader(cookieA),
  });
  if (!members.res.ok) fail("members", members.res.status);
  ok("members list", `count ${members.json.members?.length ?? 0}`);
}

if (orgList.length < 2) {
  ok("org switcher", "only one org (skip switch test — run db:local:pilot-fixture for dev-org)");
} else {
  const other = orgList.find((o) => o.organization_id !== orgId);
  if (other) {
    const switched = await req(`${idBase}/orgs/switch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(cookieA),
      },
      body: JSON.stringify({ organization_id: other.organization_id }),
    });
    if (!switched.res.ok) fail("org switch", switched.res.status);
    ok("org switcher", other.slug);
  }
}

const traces = await req(`${consoleBase}/traces`, {
  headers: cookieHeader(cookieA),
});
if (!traces.res.ok) fail("traces", traces.res.status);
ok("traces list");

const policies = await req(`${consoleBase}/policies`, {
  headers: cookieHeader(cookieA),
});
if (!policies.res.ok) fail("policies", policies.res.status);
ok("policies", `count ${policies.json.policies?.length ?? 0}`);

const keys = await req(`${consoleBase}/ingest-keys`, {
  headers: cookieHeader(cookieA),
});
if (!keys.res.ok) fail("ingest-keys list", keys.res.status);
ok("ingest-keys list");

const planUsage = await req(`${consoleBase}/organization/plan-usage`, {
  headers: cookieHeader(cookieA),
});
if (!planUsage.res.ok) fail("plan-usage", planUsage.res.status);
ok("plan-usage", planUsage.json.plan_usage?.plan);

const audit = await req(`${consoleBase}/audit-logs`, {
  headers: cookieHeader(cookieA),
});
if (!audit.res.ok) fail("audit logs", audit.res.status);
ok("audit logs");

console.log("\n=== PHASE A API SMOKE PASSED ===");
console.log("Manual UI pass: browser on :3000 — see docs/E2E_PARTNER_ONBOARDING.md");
