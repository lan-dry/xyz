/**
 * Phase B smoke: provision org, set low monthly event cap, ingest until HTTP 402.
 *
 * Requires: Postgres migrated, aegis-api :8080, id :8091, PLATFORM_BOOTSTRAP_SECRET in .env
 */
import { createHash, randomUUID } from "node:crypto";
import { signEvent, type ApsEvent } from "@salanor/aegis";
import { loadEnvFile } from "./load-env.mts";

loadEnvFile();

const secret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
const idBase = process.env.SALANOR_ID_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8091";
const idV1 = `${idBase}/v1/id`;
const apiBase = process.env.AEGIS_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8080";
const consoleBase = `${apiBase}/v1/console`;

const MONTHLY_CAP = 2;

function fail(msg: string): never {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}
function ok(msg: string) {
  console.log(`OK  ${msg}`);
}

async function health(url: string, label: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) fail(`${label} not healthy (${res.status}) at ${url}`);
    ok(`${label} up`);
  } catch {
    fail(`${label} unreachable at ${url} — run pnpm dev and docker compose up -d`);
  }
}

function parseCookies(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const joined = raw.join("; ");
  const m = joined.match(/salanor_session=([^;]+)/);
  return m?.[1] ?? "";
}

async function reqJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
): Promise<{ res: Response; json: T; cookie: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    json = { raw: text } as T;
  }
  return { res, json, cookie: parseCookies(res) };
}

async function ingestOnce(params: {
  event: ApsEvent;
  privateKeyB64: string;
  keyId: string;
  ingestApiKey: string;
  label: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const signed = await signEvent(params.event, {
    privateKeyB64: params.privateKeyB64,
    keyId: params.keyId,
  });
  const url = new URL("/v1/aegis/events", apiBase);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.ingestApiKey}`,
      "Content-Type": "application/json",
      "Salanor-Version": "2026-05-18",
      "Idempotency-Key": `limit-test-${params.event.event_id}`,
    },
    body: JSON.stringify(signed),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`    ${params.label}: HTTP ${res.status} ${body.code ?? body.error ?? ""}`);
  return { status: res.status, body };
}

function buildEvent(
  organizationId: string,
  agentId: string,
  keyId: string,
  suffix: string,
): ApsEvent {
  const eventId = `evt_${randomUUID().replace(/-/g, "").slice(0, 20)}${suffix}`;
  return {
    schema_version: 1,
    event_id: eventId,
    organization_id: organizationId,
    trace_id: `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    agent_id: agentId,
    key_id: keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: "plan-limit-test",
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "test.echo",
    payload: {
      message: "plan limit test",
      idempotency_key: createHash("sha256").update(eventId).digest("hex").slice(0, 16),
    },
  };
}

console.log("== Plan limit → 402 ==");

if (!secret) {
  fail("PLATFORM_BOOTSTRAP_SECRET missing in repo root .env");
}

await health(`${apiBase}/health`, "aegis-api");
await health(`${idBase}/health`, "id");

const ts = Date.now();
const slug = `limit-test-${ts}`;
const adminEmail = `limit-admin-${ts}@test.salanor.local`;
const adminPass = "LimitTest1!";

const prov = await reqJson<{
  organization_id?: string;
  default_agent?: {
    agent_id: string;
    key_id: string;
    private_key_b64: string;
  };
}>(`${idV1}/platform/organizations`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Platform-Secret": secret,
  },
  body: JSON.stringify({
    name: `Limit Test ${ts}`,
    slug,
    admin_email: adminEmail,
    admin_password: adminPass,
  }),
});

if (!prov.res.ok || !prov.json.organization_id || !prov.json.default_agent) {
  fail(`provision ${prov.res.status} ${JSON.stringify(prov.json)}`);
}
const orgId = prov.json.organization_id;
const agent = prov.json.default_agent;
ok(`provisioned org ${orgId} slug ${slug}`);

const patch = await reqJson(`${idV1}/platform/organizations/${orgId}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    "X-Platform-Secret": secret,
  },
  body: JSON.stringify({
    plan_overrides: { events_per_month: MONTHLY_CAP },
  }),
});
if (!patch.res.ok) {
  fail(`set plan_overrides ${patch.res.status} ${JSON.stringify(patch.json)}`);
}
ok(`monthly cap override = ${MONTHLY_CAP}`);

const login = await reqJson<{ user?: { role?: string } }>(`${idV1}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPass }),
});
if (!login.res.ok || !login.cookie) {
  fail(`admin login ${login.res.status}`);
}
ok("admin login");

const keyRes = await reqJson<{ secret?: string }>(`${consoleBase}/ingest-keys`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: `salanor_session=${login.cookie}`,
  },
  body: JSON.stringify({ name: "limit-test-key" }),
});
if (keyRes.res.status !== 201 || !keyRes.json.secret) {
  fail(`create ingest key ${keyRes.res.status} ${JSON.stringify(keyRes.json)}`);
}
const ingestKey = keyRes.json.secret;
ok("ingest API key created");

console.log("  Ingest attempts:");
for (let i = 1; i <= MONTHLY_CAP; i++) {
  const event = buildEvent(orgId, agent.agent_id, agent.key_id, String(i));
  const { status } = await ingestOnce({
    event,
    privateKeyB64: agent.private_key_b64,
    keyId: agent.key_id,
    ingestApiKey: ingestKey,
    label: `event ${i}/${MONTHLY_CAP}`,
  });
  if (status !== 201) {
    fail(`expected 201 on event ${i}, got ${status}`);
  }
}

const over = buildEvent(orgId, agent.agent_id, agent.key_id, "over");
const blocked = await ingestOnce({
  event: over,
  privateKeyB64: agent.private_key_b64,
  keyId: agent.key_id,
  ingestApiKey: ingestKey,
  label: `event ${MONTHLY_CAP + 1} (over cap)`,
});

if (blocked.status !== 402) {
  fail(`expected 402 on over-cap ingest, got ${blocked.status} ${JSON.stringify(blocked.body)}`);
}
if (blocked.body.code !== "events_limit") {
  fail(`expected code events_limit, got ${String(blocked.body.code)}`);
}

console.log("\n=== PASSED ===");
console.log(`Org ${slug} (${orgId}) blocked at ${MONTHLY_CAP} events/month with code events_limit.`);
