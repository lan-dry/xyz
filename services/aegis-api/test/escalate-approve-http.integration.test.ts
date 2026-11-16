/**
 * Regression: after escalate_to_role metadata is applied, head_of_compliance
 * can approve via console HTTP (scenario 10). Requires a real event row
 * (not provisional evt_gov_) so approval FK succeeds.
 */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "../src/db/load-env.js";
import { seedAuthorityFromPack } from "../src/bank/repo.js";
import { applyEscalateToRoleMetadata } from "../src/bank/console-approval-guard.js";
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

describeIfDb("escalated approve HTTP (scenario 10 root)", () => {
  const prevDemo = process.env.AEGIS_DEMO_MODE;
  const prevPass = process.env.AEGIS_DEMO_APPROVAL_PASSWORD;

  beforeAll(async () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.AEGIS_DEMO_APPROVAL_PASSWORD =
      prevPass && prevPass.length >= 10
        ? prevPass
        : "test-demo-approval-password";
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
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (prevDemo === undefined) delete process.env.AEGIS_DEMO_MODE;
    else process.env.AEGIS_DEMO_MODE = prevDemo;
    if (prevPass === undefined) delete process.env.AEGIS_DEMO_APPROVAL_PASSWORD;
    else process.env.AEGIS_DEMO_APPROVAL_PASSWORD = prevPass;
    await closePool();
  });

  it("sealed event → request → escalate metadata → head approve 200", async () => {
    const pool = getPool();
    const eventId = `evt_esc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const traceId = `trc_esc_${randomUUID().slice(0, 8)}`;
    const client = await pool.connect();
    let approvalId = "";
    try {
      await insertTrace(client, traceId, ORG, AGENT);
      // Include deferred_request so createApprovalRequest does not re-sign
      // (append-only blocks event_hash UPDATE).
      await client.query(
        `INSERT INTO event (
           event_id, organization_id, trace_id, agent_id, key_id, sequence_num,
           event_hash, actor_type, actor_principal, action_kind, policy_decision,
           sig_value_b64, payload, emitted_at
         ) VALUES (
           $1, $2, $3, $4, $5, 1,
           $6, 'system', 'aegis.governed.decide', 'policy_decision', 'allow',
           'c2ln', $7::jsonb, now()
         )`,
        [
          eventId,
          ORG,
          traceId,
          AGENT,
          KEY,
          `hash-${eventId}`,
          JSON.stringify({
            deferred_request: {
              url: "https://example.test/callback",
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
        deferred: {
          url: "https://example.test/callback",
          method: "POST",
        },
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
            escalate_to_role: "head_of_compliance",
          }),
        ],
      );
      const meta = await client.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM approval WHERE approval_id = $1`,
        [approvalId],
      );
      const next = applyEscalateToRoleMetadata(
        meta.rows[0]?.metadata ?? {},
        "head_of_compliance",
        { membership_id: "system", email: "system@demo" },
      );
      await client.query(
        `UPDATE approval SET metadata = $2::jsonb WHERE approval_id = $1`,
        [approvalId, JSON.stringify(next)],
      );
    } finally {
      client.release();
    }

    const app = new Hono();
    app.route("/v1/console", consoleRoutes);
    const login = await app.request("/v1/console/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "head@demo.test",
        password: demoApprovalPassword(),
      }),
    });
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/aegis_session=([^;]+)/);
    expect(match).toBeTruthy();

    const approve = await app.request(
      `/v1/console/approvals/${approvalId}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `aegis_session=${match![1]}`,
        },
        body: JSON.stringify({
          reason_code: "ESCALATED",
          comment: "after escalate window",
        }),
      },
    );
    expect(approve.status).toBe(200);
  });
});
