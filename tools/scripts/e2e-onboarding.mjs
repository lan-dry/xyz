/**
 * Local E2E onboarding (API). Loads repo root .env.
 * Requires: Postgres, aegis-api :8080, id :8091
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] ??= m[2].trim();
}

const secret = process.env.PLATFORM_BOOTSTRAP_SECRET;
const idBase = "http://127.0.0.1:8091/v1/id";
const consoleBase = "http://127.0.0.1:8080/v1/console";

const ts = Date.now();
const slug = `pilot-org-${ts}`;
const adminEmail = `admin-${ts}@test.salanor.local`;
const memberEmail = `engineer-${ts}@test.salanor.local`;
const adminPass = "PilotAdmin1!";
const memberPass = "PilotMember1!";

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

console.log("== E2E onboarding ==");

if (!secret) fail("env", "PLATFORM_BOOTSTRAP_SECRET missing in .env");

const provHttp = await req(`${idBase}/platform/organizations`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Platform-Secret": secret,
  },
  body: JSON.stringify({
    name: `Pilot Org ${ts}`,
    slug,
    admin_email: adminEmail,
    admin_password: adminPass,
  }),
});

let provisionNote = "";
if (provHttp.res.ok) {
  ok("provision (HTTP)", `org ${provHttp.json.organization_id}`);
} else if (provHttp.res.status === 403) {
  console.warn(
    "WARN provision HTTP 403 — Salanor ID process likely started without PLATFORM_BOOTSTRAP_SECRET.",
  );
  console.warn("     Using seeded dev admin for invite/RBAC tests (restart: pnpm dev from repo with .env).");
  provisionNote = "used-dev-admin";
} else {
  fail("provision", `${provHttp.res.status} ${JSON.stringify(provHttp.json)}`);
}

const loginEmail = provisionNote ? "dev@salanor.local" : adminEmail;
const loginPass = provisionNote
  ? (process.env.DEV_CONSOLE_PASSWORD_ORG_A ?? "dev-admin-change-me")
  : adminPass;

const login = await req(`${idBase}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: loginEmail, password: loginPass }),
});
if (!login.res.ok) fail("admin login", `${login.res.status} ${JSON.stringify(login.json)}`);
const adminCookie = login.cookie;
ok("admin login", `${loginEmail} role ${login.json.user?.role}`);

const traces = await req(`${consoleBase}/traces`, {
  headers: { ...cookieHeader(adminCookie) },
});
if (!traces.res.ok) fail("admin traces", `${traces.res.status}`);
ok("admin traces", `count ${traces.json.traces?.length ?? 0}`);

const orgId = login.json.organization?.organization_id;
const inv = await req(`${idBase}/orgs/${orgId}/invitations`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...cookieHeader(adminCookie),
  },
  body: JSON.stringify({ email: memberEmail, role: "engineer" }),
});
if (!inv.res.ok) fail("invite", `${inv.res.status} ${JSON.stringify(inv.json)}`);
const token = new URL(inv.json.invite_url).searchParams.get("token");
ok("invite", inv.json.invite_url);

const preview = await req(
  `${idBase}/invitations/preview?token=${encodeURIComponent(token)}`,
);
if (!preview.res.ok) fail("preview", `${preview.res.status}`);
ok("preview", `has_account=${preview.json.has_account}`);

const accept = await req(`${idBase}/invitations/signup-accept`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token,
    password: memberPass,
    display_name: "Pilot Engineer",
  }),
});
if (!accept.res.ok) fail("signup-accept", `${accept.res.status} ${JSON.stringify(accept.json)}`);
const memberCookie = accept.cookie;
ok("signup-accept", `role ${accept.json.user?.role}`);

const memberTraces = await req(`${consoleBase}/traces`, {
  headers: { ...cookieHeader(memberCookie) },
});
if (!memberTraces.res.ok) fail("member traces", `${memberTraces.res.status}`);
ok("member traces", "engineer read access");

const key = await req(`${consoleBase}/ingest-keys`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...cookieHeader(adminCookie),
  },
  body: JSON.stringify({ name: "e2e-key" }),
});
if (key.res.status !== 201) fail("create key", `${key.res.status}`);
ok("admin create API key", key.json.key?.key_prefix);

const memberKey = await req(`${consoleBase}/ingest-keys`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...cookieHeader(memberCookie),
  },
  body: JSON.stringify({ name: "should-fail" }),
});
if (memberKey.res.status === 201) fail("RBAC", "engineer created key");
ok("RBAC", `engineer blocked (${memberKey.res.status})`);

const pol = await req(`${consoleBase}/policies`, {
  headers: { ...cookieHeader(memberCookie) },
});
if (!pol.res.ok) fail("policies", `${pol.res.status}`);
ok("policies", `count ${pol.json.policies?.length ?? 0}`);

const logs = await req(`${consoleBase}/audit-logs`, {
  headers: { ...cookieHeader(adminCookie) },
});
if (!logs.res.ok) fail("audit logs", `${logs.res.status}`);
ok("audit logs", `count ${logs.json.logs?.length ?? 0}`);

console.log("\n=== ALL PASSED ===");
if (!provisionNote) {
  console.log(`New org admin: ${adminEmail} / ${adminPass}`);
}
console.log(`New member: ${memberEmail} / ${memberPass}`);
console.log("UI: http://localhost:3000/login");
