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

/** Demo org/agent/keys for vitest and optional local pilot — no accounts. */
export async function applyIntegrationFixture(
  client: pg.Pool | pg.PoolClient,
): Promise<void> {
  // Each integration suite gets a clean fixture organization. This prevents
  // tamper and chain tests from contaminating later suites on a developer DB.
  const legacyEventFilter =
    `event_id IN (
       SELECT event_id FROM event
       WHERE policy_id = 'pol_dev_default' OR agent_id = 'agent-dev-01'
     )`;
  await client.query(`DELETE FROM approval WHERE ${legacyEventFilter}`);
  await client.query(`DELETE FROM artifact WHERE ${legacyEventFilter}`);
  await client.query(`DELETE FROM inclusion_proof WHERE ${legacyEventFilter}`);
  await client.query(`DELETE FROM transparency_log_entry WHERE ${legacyEventFilter}`);
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
  await client.query(`DELETE FROM trace WHERE agent_id = 'agent-dev-01'`);
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
  await client.query(`DELETE FROM trace WHERE organization_id = $1`, [
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
