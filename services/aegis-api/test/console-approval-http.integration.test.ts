/**
 * Posts approve through real console session cookies + bank ladder.
 * Complements unit guards; closes the HTTP+session coverage gap.
 */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "../src/db/load-env.js";
import { seedAuthorityFromPack } from "../src/bank/repo.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  demoApprovalPassword,
  seedDemoApprovalActors,
} from "../src/demo/seed-approval-actors.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";
import { createApprovalRequest } from "../src/repo/approvals.js";
import { consoleRoutes } from "../src/routes/console/index.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import {
  ensureDevBridgeKey,
  ensureDevIngestKey,
  ensureDevSigningKey,
  insertTrace,
} from "./helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const AGENT = "agent-dev-01";
const KEY = "key-dev-01";
const INGEST = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

function appWithConsole() {
  const app = new Hono();
  app.route("/v1/console", consoleRoutes);
  return app;
}

async function loginCookie(app: Hono, email: string, password: string) {
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

describeIfDb("console approval HTTP + bank ladder", () => {
  const prevDemo = process.env.AEGIS_DEMO_MODE;
  const prevNode = process.env.NODE_ENV;
  const prevAegis = process.env.AEGIS_ENV;
  const prevPass = process.env.AEGIS_DEMO_APPROVAL_PASSWORD;

  beforeAll(async () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.AEGIS_DEMO_APPROVAL_PASSWORD =
      prevPass && prevPass.length >= 10
        ? prevPass
        : "test-demo-approval-password";
    delete process.env.NODE_ENV;
    delete process.env.AEGIS_ENV;
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await ensureDevIngestKey(pool, INGEST, ORG);
    await ensureDevSigningKey(pool, privateKeyB64, KEY, AGENT, ORG);
    await ensureDevBridgeKey(pool, privateKeyB64, KEY, AGENT, ORG);

    const pack = loadDemoPack("banking");
    const client = await pool.connect();
    try {
      await seedAuthorityFromPack(
        client,
        ORG,
        packRoles(pack),
        packMatrixRows(pack),
      );
      await seedDemoApprovalActors(client, ORG);
      await client.query(
        `UPDATE membership m
         SET last_active_at = now()
         FROM account a
         WHERE a.account_id = m.account_id
           AND m.organization_id = $1
           AND lower(a.email) LIKE '%@demo.test'`,
        [ORG],
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (prevDemo === undefined) delete process.env.AEGIS_DEMO_MODE;
    else process.env.AEGIS_DEMO_MODE = prevDemo;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAegis === undefined) delete process.env.AEGIS_ENV;
    else process.env.AEGIS_ENV = prevAegis;
    if (prevPass === undefined) delete process.env.AEGIS_DEMO_APPROVAL_PASSWORD;
    else process.env.AEGIS_DEMO_APPROVAL_PASSWORD = prevPass;
    await closePool();
  });

  it("officer 403 then manager 200 on /v1/console/approvals/:id/approve", async () => {
    const pool = getPool();
    const eventId = `evt-apr-http-${randomUUID().slice(0, 8)}`;
    const traceId = `trc-apr-http-${randomUUID().slice(0, 8)}`;
    const client = await pool.connect();
    let approvalId: string;
    try {
      await insertTrace(client, traceId, ORG, AGENT);
      // Payload already includes deferred_request so createApprovalRequest
      // does not try to re-sign (append-only trigger blocks event UPDATE).
      await client.query(
        `INSERT INTO event (
           event_id, organization_id, trace_id, agent_id, key_id, sequence_num,
           event_hash, actor_type, actor_principal, action_kind, policy_decision,
           sig_value_b64, payload, emitted_at
         ) VALUES (
           $1, $2, $3, $4, $5, 91,
           $6, 'agent', 'test-principal', 'tool_call', 'allow', 'c2ln',
           $7::jsonb, now()
         )
         ON CONFLICT (event_id) DO NOTHING`,
        [
          eventId,
          ORG,
          traceId,
          AGENT,
          KEY,
          `hash-${eventId}`,
          JSON.stringify({
            deferred_request: {
              url: "https://example.test/cb",
              method: "POST",
            },
            obligation_tool: "governed.action",
          }),
        ],
      );
      const created = await createApprovalRequest(client, {
        organizationId: ORG,
        eventId,
        traceId,
        toolName: "governed.action",
        deferred: { url: "https://example.test/cb", method: "POST" },
      });
      approvalId = created.approval_id;
      await client.query(
        `UPDATE approval
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE approval_id = $1`,
        [
          approvalId,
          JSON.stringify({
            required_role: "credit_manager",
            required_roles: ["credit_manager"],
          }),
        ],
      );
    } finally {
      client.release();
    }

    const app = appWithConsole();
    const password = demoApprovalPassword();
    const officerCookie = await loginCookie(app, "officer@demo.test", password);
    const officer = await app.request(
      `/v1/console/approvals/${approvalId}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `aegis_session=${officerCookie}`,
        },
        body: JSON.stringify({
          reason_code: "TRY",
          comment: "officer",
          required_role: "credit_manager",
        }),
      },
    );
    expect(officer.status).toBe(403);

    const managerCookie = await loginCookie(app, "manager@demo.test", password);
    const manager = await app.request(
      `/v1/console/approvals/${approvalId}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `aegis_session=${managerCookie}`,
        },
        body: JSON.stringify({
          reason_code: "CREDIT_OK",
          comment: "manager",
          required_role: "credit_manager",
        }),
      },
    );
    expect(manager.status).toBe(200);
  });
});
