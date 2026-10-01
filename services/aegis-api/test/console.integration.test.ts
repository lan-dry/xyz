import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { consoleRoutes } from "../src/routes/console/index.js";
import {
  applyIntegrationFixture,
  INTEGRATION_MEMBERSHIP_A,
  INTEGRATION_MEMBERSHIP_B,
  INTEGRATION_ORG_A,
  INTEGRATION_ORG_B,
} from "./integration-fixture.js";
import { insertTestAdmin } from "./insert-test-admin.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG_A = INTEGRATION_ORG_A;
const VITEST_PASSWORD = "vitest-console-pass-12";

let adminOrgAEmail: string;
let adminOrgBEmail: string;

function appWithConsole() {
  const app = new Hono();
  app.route("/v1/console", consoleRoutes);
  return app;
}

async function login(
  app: Hono,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.request("/v1/console/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/aegis_session=([^;]+)/);
  expect(match).toBeTruthy();
  return match![1]!;
}

describeIfDb("console API", () => {
  beforeAll(async () => {
    await migrateUp();
    await applyIntegrationFixture(getPool());
    await getPool().query(
      `INSERT INTO organization (organization_id, name, slug, onboarding_completed_at)
       VALUES ($1, 'Isolation Test Organization', 'dev-org-b', now())
       ON CONFLICT (slug) DO NOTHING`,
      [INTEGRATION_ORG_B],
    );
    const a = await insertTestAdmin(getPool(), {
      organizationId: ORG_A,
      membershipId: INTEGRATION_MEMBERSHIP_A,
      password: VITEST_PASSWORD,
    });
    const b = await insertTestAdmin(getPool(), {
      organizationId: INTEGRATION_ORG_B,
      membershipId: INTEGRATION_MEMBERSHIP_B,
      password: VITEST_PASSWORD,
    });
    adminOrgAEmail = a.email;
    adminOrgBEmail = b.email;
  });

  afterAll(async () => {
    await closePool();
  });

  it("org A sees traces when events exist; org B sees none", async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO trace (trace_id, organization_id, agent_id, started_at, status)
       VALUES ('trc-console-a', $1, 'agent-dev-01', now(), 'running')
       ON CONFLICT (trace_id) DO NOTHING`,
      [ORG_A],
    );
    await pool.query(
      `INSERT INTO event (
         event_id, organization_id, trace_id, agent_id, key_id, sequence_num,
         event_hash, actor_type, actor_principal, action_kind, policy_decision,
         sig_alg, sig_value_b64, payload, emitted_at
       )
       SELECT
         'evt-console-a', $1, 'trc-console-a', 'agent-dev-01', 'key-dev-01',
         COALESCE(
           (SELECT MAX(sequence_num) FROM event
            WHERE organization_id = $1 AND agent_id = 'agent-dev-01'),
           0
         ) + 1,
         'abc', 'agent', 'test', 'tool_call', 'allow', 'ed25519', 'c2ln', '{}', now()
       WHERE NOT EXISTS (SELECT 1 FROM event WHERE event_id = 'evt-console-a')`,
      [ORG_A],
    );
    await pool.query(
      `UPDATE trace SET root_event_id = 'evt-console-a'
       WHERE trace_id = 'trc-console-a' AND organization_id = $1`,
      [ORG_A],
    );

    const app = appWithConsole();
    const cookieA = await login(app, adminOrgAEmail, VITEST_PASSWORD);
    const resA = await app.request("/v1/console/traces", {
      headers: { Cookie: `aegis_session=${cookieA}` },
    });
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as {
      traces: {
        trace_id: string;
        chain_root_hash: string;
        root_event_id: string | null;
      }[];
      total: number;
    };
    const traceA = bodyA.traces.find((t) => t.trace_id === "trc-console-a");
    expect(traceA).toBeTruthy();
    expect(traceA!.chain_root_hash).toHaveLength(64);
    expect(traceA!.root_event_id).toBe("evt-console-a");
    expect(bodyA.total).toBeGreaterThanOrEqual(1);

    const filtered = await app.request(
      "/v1/console/traces?q=trc-console-a&status=running",
      { headers: { Cookie: `aegis_session=${cookieA}` } },
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as {
      traces: { trace_id: string }[];
    };
    expect(filteredBody.traces.some((t) => t.trace_id === "trc-console-a")).toBe(
      true,
    );

    const detail = await app.request("/v1/console/traces/trc-console-a", {
      headers: { Cookie: `aegis_session=${cookieA}` },
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      events: { provenance_claim: string }[];
    };
    expect(detailBody.events[0]?.provenance_claim).toContain("agent-dev-01");

    const cookieB = await login(app, adminOrgBEmail, VITEST_PASSWORD);
    const resB = await app.request("/v1/console/traces", {
      headers: { Cookie: `aegis_session=${cookieB}` },
    });
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as { traces: unknown[] };
    expect(bodyB.traces.length).toBe(0);
  });

  it("admin can create ingest key scoped to organization", async () => {
    const app = appWithConsole();
    const cookie = await login(app, adminOrgAEmail, VITEST_PASSWORD);
    const res = await app.request("/v1/console/ingest-keys", {
      method: "POST",
      headers: {
        Cookie: `aegis_session=${cookie}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "UI created key" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { secret: string; key: { key_prefix: string } };
    expect(body.secret.startsWith("aegis_")).toBe(true);
    expect(body.key.key_prefix).toBe(body.secret.slice(0, 8));
  });
});
