import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { runOrganizationHousekeeping } from "../src/maintenance/housekeeping.js";
import { ensureDevIngestKey } from "./helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const DEV_ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const INGEST_KEY = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";

describeIfDb("housekeeping (Sprint 1)", () => {
  beforeAll(async () => {
    await migrateUp();
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));
    await ensureDevIngestKey(getPool(), INGEST_KEY, DEV_ORG);
  });

  afterAll(async () => {
    await closePool();
  });

  it("expires overdue pending approvals and fails blocked traces", async () => {
    const pool = getPool();
    const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const eventId = `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const approvalId = `apr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const seq = await pool.query<{ n: string }>(
      `SELECT COALESCE(MAX(sequence_num), 0) + 1 AS n
       FROM event WHERE organization_id = $1 AND agent_id = $2`,
      [DEV_ORG, DEV_AGENT],
    );
    const sequenceNum = seq.rows[0]?.n ?? "1";

    await pool.query(
      `INSERT INTO trace (trace_id, organization_id, agent_id, status, started_at)
       VALUES ($1, $2, $3, 'blocked', now() - interval '48 hours')`,
      [traceId, DEV_ORG, DEV_AGENT],
    );

    await pool.query(
      `INSERT INTO event (
         event_id, organization_id, trace_id, agent_id, key_id, sequence_num,
         event_hash, actor_type, actor_principal, action_kind, policy_decision,
         sig_alg, sig_value_b64, emitted_at, payload
       ) VALUES (
         $1, $2, $3, $4, $5, $7, $6, 'agent', $4, 'policy_decision',
         'allow_with_obligation', 'ed25519', 'test', now() - interval '48 hours', '{}'::jsonb
       )`,
      [eventId, DEV_ORG, traceId, DEV_AGENT, DEV_KEY, `hash-${eventId}`, sequenceNum],
    );

    await pool.query(
      `INSERT INTO approval (
         approval_id, event_id, organization_id, channel_type, token_hash,
         status, expires_at, created_at
       ) VALUES ($1, $2, $3, 'web_ui', $4, 'pending', now() - interval '1 hour', now() - interval '25 hours')`,
      [
        approvalId,
        eventId,
        DEV_ORG,
        randomUUID().replace(/-/g, ""),
      ],
    );

    const result = await runOrganizationHousekeeping(pool, DEV_ORG);
    expect(result.expired_approvals).toBeGreaterThanOrEqual(1);

    const approval = await pool.query<{ status: string }>(
      `SELECT status FROM approval WHERE approval_id = $1`,
      [approvalId],
    );
    expect(approval.rows[0]?.status).toBe("expired");

    const trace = await pool.query<{ status: string }>(
      `SELECT status FROM trace WHERE trace_id = $1`,
      [traceId],
    );
    expect(trace.rows[0]?.status).toBe("failed");
  });

  it("fails stale running traces without pending approvals", async () => {
    const pool = getPool();
    const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    await pool.query(
      `INSERT INTO trace (trace_id, organization_id, agent_id, status, started_at)
       VALUES ($1, $2, $3, 'running', now() - interval '48 hours')`,
      [traceId, DEV_ORG, DEV_AGENT],
    );

    const result = await runOrganizationHousekeeping(pool, DEV_ORG);
    expect(result.stale_traces_failed).toBeGreaterThanOrEqual(1);

    const trace = await pool.query<{ status: string }>(
      `SELECT status FROM trace WHERE trace_id = $1`,
      [traceId],
    );
    expect(trace.rows[0]?.status).toBe("failed");
  });
});
