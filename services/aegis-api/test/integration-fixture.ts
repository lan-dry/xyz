import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import {
  ensureDevIngestKey,
  ensureDevSigningKey,
} from "./helpers.js";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tools/seed/integration-fixture.sql",
);

export const INTEGRATION_ORG_A = "11111111-1111-4111-8111-111111111111";
export const INTEGRATION_ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const INTEGRATION_MEMBERSHIP_A = "22222222-2222-4222-8222-222222222222";
export const INTEGRATION_MEMBERSHIP_B = "33333333-3333-4333-8333-333333333334";

/**
 * Demo org/agent/keys for vitest and optional local pilot — no accounts.
 *
 * Append-only (migration 015): sealed `event` rows cannot be DELETE/UPDATE'd by
 * normal roles. We briefly set `session_replication_role = replica` ONLY to clear
 * event/chain rows. That mode also disables FK CASCADE, so we must NOT delete
 * `organization` while replica is on — otherwise orphan policies survive and
 * later evaluateRules can allow tools that the fixture deny rule should block.
 */
export async function applyIntegrationFixture(
  client: pg.Pool | pg.PoolClient,
): Promise<void> {
  const legacyEventFilter =
    `event_id IN (
       SELECT event_id FROM event
       WHERE policy_id = 'pol_dev_default' OR agent_id = 'agent-dev-01'
     )`;

  // 1) Clear sealed events / chain under replica (triggers off).
  await client.query(`SET session_replication_role = replica`);
  try {
    await client.query(`DELETE FROM approval WHERE ${legacyEventFilter}`);
    await client.query(`DELETE FROM artifact WHERE ${legacyEventFilter}`);
    await client.query(`DELETE FROM inclusion_proof WHERE ${legacyEventFilter}`);
    await client.query(
      `DELETE FROM transparency_log_entry WHERE ${legacyEventFilter}`,
    );
    await client.query(
      `UPDATE event SET parent_event_id = NULL
       WHERE parent_event_id IN (
         SELECT event_id FROM event
         WHERE policy_id = 'pol_dev_default' OR agent_id = 'agent-dev-01'
       )`,
    );
    await client.query(
      `DELETE FROM event
       WHERE policy_id = 'pol_dev_default' OR agent_id = 'agent-dev-01'`,
    );
    await client.query(`DELETE FROM approval WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
    await client.query(`DELETE FROM artifact WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
    await client.query(`DELETE FROM inclusion_proof WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
    await client.query(
      `DELETE FROM transparency_log_entry WHERE organization_id = $1`,
      [INTEGRATION_ORG_A],
    );
    await client.query(
      `UPDATE event SET parent_event_id = NULL WHERE organization_id = $1`,
      [INTEGRATION_ORG_A],
    );
    await client.query(`DELETE FROM event WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
    await client.query(`DELETE FROM forensic_receipt WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
    await client.query(
      `DELETE FROM forensic_receipt_seq WHERE organization_id = $1`,
      [INTEGRATION_ORG_A],
    );
    await client.query(
      `DELETE FROM forensic_checkpoint WHERE organization_id = $1`,
      [INTEGRATION_ORG_A],
    );
    await client.query(`DELETE FROM bank_case WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
    await client.query(`DELETE FROM trace WHERE agent_id = 'agent-dev-01'`);
    await client.query(`DELETE FROM trace WHERE organization_id = $1`, [
      INTEGRATION_ORG_A,
    ]);
  } finally {
    await client.query(`SET session_replication_role = DEFAULT`);
  }

  // 2) Normal FK-enforced cleanup so CASCADE actually runs (policies, keys, …).
  // workflow_run historically lacked ON DELETE CASCADE — clear explicitly.
  await client.query(`DELETE FROM workflow_run WHERE organization_id = $1`, [
    INTEGRATION_ORG_A,
  ]);
  await client.query(
    `DELETE FROM organization
     WHERE organization_id = $1 OR slug = 'dev-org'`,
    [INTEGRATION_ORG_A],
  );

  await client.query(readFileSync(FIXTURE_PATH, "utf8"));
  const ingestKey =
    process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
  const privateKeyB64 =
    process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
    "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";
  await ensureDevIngestKey(client, ingestKey, INTEGRATION_ORG_A);
  await ensureDevSigningKey(
    client,
    privateKeyB64,
    "key-dev-01",
    "agent-dev-01",
    INTEGRATION_ORG_A,
  );
}
