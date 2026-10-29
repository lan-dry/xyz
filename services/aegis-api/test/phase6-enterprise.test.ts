import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { purgeExpiredForOrganization } from "../src/maintenance/retention-purge.js";
import { applyIntegrationFixture } from "./integration-fixture.js";
import { canDecideApprovals, canWriteOrgConsole } from "@salanor/platform-auth";
import type { ConsoleSession } from "@salanor/platform-auth";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const DEV_ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";

function session(role: string): ConsoleSession {
  return {
    sessionId: "sess-1",
    userId: "mem-1",
    accountId: "acc-1",
    organizationId: DEV_ORG,
    email: "u@example.com",
    displayName: "U",
    role,
  };
}

describe("Phase 6 RBAC", () => {
  it("auditor cannot write policies/org or decide approvals", () => {
    expect(canWriteOrgConsole(session("auditor"), DEV_ORG)).toBe(false);
    expect(canDecideApprovals(session("auditor"), DEV_ORG)).toBe(false);
  });

  it("approver can decide approvals but not mutate policies", () => {
    expect(canDecideApprovals(session("approver"), DEV_ORG)).toBe(true);
    expect(canWriteOrgConsole(session("approver"), DEV_ORG)).toBe(false);
  });

  it("admin and owner can write and decide", () => {
    expect(canWriteOrgConsole(session("admin"), DEV_ORG)).toBe(true);
    expect(canDecideApprovals(session("owner"), DEV_ORG)).toBe(true);
  });
});

describeIfDb("Phase 6 legal hold purge", () => {
  beforeAll(async () => {
    await migrateUp();
    await applyIntegrationFixture(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("skips purge when org legal hold is on", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE organization SET legal_hold = true WHERE organization_id = $1`,
      [DEV_ORG],
    );
    const result = await purgeExpiredForOrganization(pool, DEV_ORG);
    expect(result.skipped_legal_hold).toBe(true);
    expect(result.events_redacted).toBe(0);
    await pool.query(
      `UPDATE organization SET legal_hold = false WHERE organization_id = $1`,
      [DEV_ORG],
    );
  });

  it("does not redact events on per-event legal hold", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE organization SET legal_hold = false WHERE organization_id = $1`,
      [DEV_ORG],
    );

    const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const heldId = `evt_hold_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const openId = `evt_open_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const seq = await pool.query<{ n: string }>(
      `SELECT COALESCE(MAX(sequence_num), 0) + 1 AS n
       FROM event WHERE organization_id = $1 AND agent_id = $2`,
      [DEV_ORG, DEV_AGENT],
    );
    const base = Number(seq.rows[0]?.n ?? 1);

    await pool.query(
      `INSERT INTO trace (trace_id, organization_id, agent_id, status, started_at)
       VALUES ($1, $2, $3, 'completed', now() - interval '400 days')
       ON CONFLICT DO NOTHING`,
      [traceId, DEV_ORG, DEV_AGENT],
    );

    for (const [eventId, seqNum, hold] of [
      [heldId, base, true],
      [openId, base + 1, false],
    ] as const) {
      await pool.query(
        `INSERT INTO event (
           event_id, organization_id, trace_id, agent_id, key_id, sequence_num,
           event_hash, actor_type, actor_principal, action_kind, policy_decision,
           sig_alg, sig_value_b64, emitted_at, payload, legal_hold
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, 'agent', $4, 'tool_call', 'allow',
           'ed25519', 'test', now() - interval '400 days', '{"keep":true}'::jsonb, $8
         )
         ON CONFLICT (event_id) DO UPDATE
         SET legal_hold = EXCLUDED.legal_hold,
             purged_at = NULL,
             payload = EXCLUDED.payload,
             emitted_at = EXCLUDED.emitted_at`,
        [
          eventId,
          DEV_ORG,
          traceId,
          DEV_AGENT,
          DEV_KEY,
          seqNum,
          `hash-${eventId}`,
          hold,
        ],
      );
    }

    // Force a short retention window via plan_overrides for this org.
    await pool.query(
      `UPDATE organization
       SET plan_overrides = COALESCE(plan_overrides, '{}'::jsonb) || '{"retention_days": 30}'::jsonb
       WHERE organization_id = $1`,
      [DEV_ORG],
    );

    const result = await purgeExpiredForOrganization(pool, DEV_ORG);
    expect(result.skipped_legal_hold).toBe(false);
    expect(result.events_redacted).toBeGreaterThanOrEqual(1);

    const held = await pool.query<{ purged_at: Date | null; payload: unknown }>(
      `SELECT purged_at, payload FROM event WHERE event_id = $1`,
      [heldId],
    );
    expect(held.rows[0]?.purged_at).toBeNull();
    expect(held.rows[0]?.payload).toEqual({ keep: true });

    const open = await pool.query<{ purged_at: Date | null; payload: unknown }>(
      `SELECT purged_at, payload FROM event WHERE event_id = $1`,
      [openId],
    );
    expect(open.rows[0]?.purged_at).not.toBeNull();
    expect(open.rows[0]?.payload).toBeNull();

    await pool.query(
      `UPDATE organization
       SET plan_overrides = plan_overrides - 'retention_days'
       WHERE organization_id = $1`,
      [DEV_ORG],
    );
  });
});
