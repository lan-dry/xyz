/**
 * Regression: sealGovernedDecision must find a signable org key when the
 * preferred agent has none — otherwise intake falls back to provisional
 * evt_gov_ (scenario 8).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { sealGovernedDecision } from "../src/bank/seal-decision.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import { ensureDevSigningKey } from "./helpers.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const AGENT = "agent-dev-01";
const KEY = "key-dev-01";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

describeIfDb("seal signing key lookup fallback", () => {
  beforeAll(async () => {
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await ensureDevSigningKey(pool, privateKeyB64, KEY, AGENT, ORG);
  });

  afterAll(async () => {
    await closePool();
  });

  it("seals when preferred agent_id has no signing key", async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sealed = await sealGovernedDecision(client, {
        organization_id: ORG,
        trace_id: `trc_fallback_${randomUUID().slice(0, 8)}`,
        case_id: `case_fallback_${randomUUID().slice(0, 8)}`,
        decision_id: `dec_fallback_${randomUUID().slice(0, 8)}`,
        outcome: "allow",
        mode: "enforce",
        tool_name: "governed.action",
        attributes: { amount: 1 },
        matched_rules: [],
        agent_id: `agent_missing_${randomUUID().slice(0, 8)}`,
      });
      await client.query("COMMIT");
      expect(sealed).not.toBeNull();
      expect(sealed!.event_id.startsWith("evt_")).toBe(true);
      expect(sealed!.event_id.startsWith("evt_gov_")).toBe(false);
      expect(sealed!.event_hash).toBeTruthy();
      expect(sealed!.sequence_num).toBeGreaterThan(0);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
});
