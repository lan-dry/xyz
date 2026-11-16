/**
 * Regression: concurrent persistSignedEvent must not collide on
 * (organization_id, agent_id, sequence_num) — root cause of provisional
 * evt_gov_ citations and approvals/request FK 500s.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { ApsEvent } from "@salanor/aegis";
import { signEvent } from "@salanor/aegis";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { persistSignedEvent } from "../src/ingest/persist.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import {
  ensureDevIngestKey,
  ensureDevSigningKey,
  insertTrace,
} from "./helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const AGENT = "agent-dev-01";
const KEY = "key-dev-01";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

describeIfDb("event sequence lock (concurrent seal)", () => {
  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await ensureDevIngestKey(
      pool,
      process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me",
      ORG,
    );
    await ensureDevSigningKey(pool, privateKeyB64, KEY, AGENT, ORG);
  });

  afterAll(async () => {
    await closePool();
  });

  it("assigns distinct sequence_num under concurrent persist", async () => {
    const pool = getPool();
    const traceId = `trc_seq_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    {
      const setup = await pool.connect();
      try {
        await insertTrace(setup, traceId, ORG, AGENT);
      } finally {
        setup.release();
      }
    }

    const n = 12;
    const tasks = Array.from({ length: n }, async (_, i) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const unsigned: ApsEvent = {
          schema_version: 1,
          event_id: `evt_seq_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          organization_id: ORG,
          trace_id: traceId,
          agent_id: AGENT,
          key_id: KEY,
          emitted_at: new Date().toISOString(),
          actor_type: "system",
          actor_principal: "seq-lock-test",
          action_kind: "policy_decision",
          policy_decision: "allow",
          payload: { i },
        };
        const signed = await signEvent(unsigned, {
          privateKeyB64,
          keyId: KEY,
        });
        const persisted = await persistSignedEvent(client, signed, undefined);
        await client.query("COMMIT");
        return persisted.sequenceNum;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    });

    const seqs = await Promise.all(tasks);
    expect(new Set(seqs).size).toBe(n);
  });
});
