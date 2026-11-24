/**
 * Governed seal uses the exact agent id and its Workflow Bridge key only.
 * Missing agent / missing bridge → null (intake issues a provisional citation).
 * Never falls back to another org agent or signing key.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  resolveSealAgentId,
  sealGovernedDecision,
} from "../src/bank/seal-decision.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import { ensureDevBridgeKey, ensureDevSigningKey } from "./helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const AGENT = "agent-dev-01";
const KEY = "key-dev-01";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

describe("resolveSealAgentId", () => {
  it("uses actor.id when it is an agt_ id", () => {
    expect(
      resolveSealAgentId({
        actor: { type: "system", id: "agt_1a398046fee54dfbaf89db81" },
        agent_id: "credit-decision",
      }),
    ).toBe("agt_1a398046fee54dfbaf89db81");
  });

  it("ignores slug actor.id and falls back to agt_ agent_id", () => {
    expect(
      resolveSealAgentId({
        actor: { type: "system", id: "credit-decision" },
        agent_id: "agt_1a398046fee54dfbaf89db81",
      }),
    ).toBe("agt_1a398046fee54dfbaf89db81");
  });

  it("returns undefined for slug-only requests", () => {
    expect(
      resolveSealAgentId({
        actor: { type: "system", id: "credit-decision" },
      }),
    ).toBeUndefined();
  });
});

describeIfDb("seal exact agent bridge key (no org fallback)", () => {
  beforeAll(async () => {
    process.env.DEV_SIGNING_PRIVATE_KEY_B64 = privateKeyB64;
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await ensureDevSigningKey(pool, privateKeyB64, KEY, AGENT, ORG);
    await ensureDevBridgeKey(pool, privateKeyB64, KEY, AGENT, ORG);
  });

  afterAll(async () => {
    await closePool();
  });

  it("returns null when preferred agent_id has no bridge key (no fallback)", async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sealed = await sealGovernedDecision(client, {
        organization_id: ORG,
        trace_id: `trc_nofallback_${randomUUID().slice(0, 8)}`,
        case_id: `case_nofallback_${randomUUID().slice(0, 8)}`,
        decision_id: `dec_nofallback_${randomUUID().slice(0, 8)}`,
        outcome: "allow",
        mode: "enforce",
        tool_name: "governed.action",
        attributes: { amount: 1 },
        matched_rules: [],
        agent_id: `agt_missing_${randomUUID().slice(0, 8)}`,
      });
      await client.query("COMMIT");
      expect(sealed).toBeNull();
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("seals with the exact agent's bridge key", async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sealed = await sealGovernedDecision(client, {
        organization_id: ORG,
        trace_id: `trc_exact_${randomUUID().slice(0, 8)}`,
        case_id: `case_exact_${randomUUID().slice(0, 8)}`,
        decision_id: `dec_exact_${randomUUID().slice(0, 8)}`,
        outcome: "allow",
        mode: "enforce",
        tool_name: "governed.action",
        attributes: { amount: 1 },
        matched_rules: [],
        agent_id: AGENT,
      });
      await client.query("COMMIT");
      expect(sealed).not.toBeNull();
      expect(sealed!.event_id.startsWith("evt_")).toBe(true);
      expect(sealed!.event_id.startsWith("evt_gov_")).toBe(false);
      expect(sealed!.event_hash).toBeTruthy();
      expect(sealed!.sequence_num).toBeGreaterThan(0);

      const row = await pool.query<{ agent_id: string; key_id: string }>(
        `SELECT agent_id, key_id FROM event WHERE event_id = $1`,
        [sealed!.event_id],
      );
      expect(row.rows[0]?.agent_id).toBe(AGENT);
      expect(row.rows[0]?.key_id).toBe(KEY);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("returns null when agent_id is omitted (no Default-agent fallback)", async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sealed = await sealGovernedDecision(client, {
        organization_id: ORG,
        trace_id: `trc_omit_${randomUUID().slice(0, 8)}`,
        case_id: `case_omit_${randomUUID().slice(0, 8)}`,
        decision_id: `dec_omit_${randomUUID().slice(0, 8)}`,
        outcome: "allow",
        mode: "enforce",
        tool_name: "governed.action",
        attributes: { amount: 1 },
        matched_rules: [],
      });
      await client.query("COMMIT");
      expect(sealed).toBeNull();
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
});
