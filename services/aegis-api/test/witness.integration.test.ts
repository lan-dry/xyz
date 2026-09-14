import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMerkleTree, getMerkleProof, verifyMerkleProof } from "@salanor/witness-merkle";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { runWitnessBatchForOrg } from "../../aegis-signer/src/batch-lib.js";
import { verifyEventFull, type EventRowForVerify } from "../src/witness/verify-event.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";

async function loadEventRow(eventId: string): Promise<EventRowForVerify> {
  const result = await getPool().query<EventRowForVerify>(
    `SELECT
       e.schema_version, e.event_id, e.organization_id, e.trace_id, e.parent_event_id,
       e.agent_id, e.key_id, e.policy_id, e.sequence_num, e.prev_event_hash, e.event_hash,
       e.actor_type, e.actor_principal, e.action_kind, e.tool_name, e.args_hash,
       e.args_redacted, e.policy_decision, e.policy_obligations, e.result_status,
       e.output_hash, e.sig_alg, e.sig_value_b64, e.chain_valid, e.payload, e.emitted_at,
       sk.public_key_b64
     FROM event e
     JOIN signing_key sk ON sk.key_id = e.key_id
     WHERE e.organization_id = $1 AND e.event_id = $2`,
    [ORG, eventId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("event not found");
  return row;
}

describeIfDb("witness / Merkle (Stage 8 exit)", () => {
  beforeAll(async () => {
    await migrateUp();
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));
    await runWitnessBatchForOrg(getPool(), ORG);
  });

  afterAll(async () => {
    await closePool();
  });

  it("merkle library round-trips proofs", () => {
    const leaves = ["aa", "bb", "cc", "dd"];
    const { root, layers } = buildMerkleTree(leaves);
    const path = getMerkleProof(layers, 2);
    expect(verifyMerkleProof(leaves[2]!, root, path)).toBe(true);
    expect(verifyMerkleProof("tampered", root, path)).toBe(false);
  });

  it("unmodified event passes chain + inclusion verification", async () => {
    const pool = getPool();
    const first = await pool.query<{ event_id: string }>(
      `SELECT event_id FROM event WHERE organization_id = $1 ORDER BY emitted_at ASC LIMIT 1`,
      [ORG],
    );
    const eventId = first.rows[0]?.event_id;
    expect(eventId).toBeTruthy();

    const row = await loadEventRow(eventId!);
    const result = await verifyEventFull(pool, row);
    expect(result.chain_ok).toBe(true);
    expect(result.inclusion_ok).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("tampered event_hash fails inclusion and chain checks", async () => {
    const pool = getPool();
    const first = await pool.query<{ event_id: string }>(
      `SELECT event_id FROM event WHERE organization_id = $1 ORDER BY emitted_at ASC LIMIT 1`,
      [ORG],
    );
    const eventId = first.rows[0]!.event_id;

    await pool.query(
      `UPDATE event SET event_hash = $1 WHERE event_id = $2`,
      ["0".repeat(64), eventId],
    );

    const row = await loadEventRow(eventId);
    const result = await verifyEventFull(pool, row);
    expect(result.hash_ok).toBe(false);
    expect(result.inclusion_ok).toBe(false);
    expect(result.ok).toBe(false);
  });
});
