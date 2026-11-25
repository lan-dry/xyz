/**
 * Ensure a sandbox tenant can seal APS events server-side (bridge vault key).
 * Without this, bank / test-sender decisions stay provisional and leave no trace row.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { encryptBridgePrivateKey, isBridgeMasterKeyConfigured } from "../crypto/bridge-key-vault.js";
import { generateEd25519KeyPair } from "@salanor/platform-auth";

const AGENT_SLUG = "sandbox-default";

export async function ensureSandboxSigningAgent(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  organizationSlug?: string,
): Promise<{ agent_id: string; key_id: string } | null> {
  if (!isBridgeMasterKeyConfigured()) {
    return null;
  }

  const existing = await client.query<{ agent_id: string; key_id: string }>(
    `SELECT a.agent_id, sk.key_id
     FROM agent a
     JOIN signing_key sk
       ON sk.agent_id = a.agent_id
      AND sk.organization_id = a.organization_id
      AND sk.revoked = false
      AND sk.private_key_ciphertext IS NOT NULL
     WHERE a.organization_id = $1
       AND a.active = true
     ORDER BY sk.created_at DESC
     LIMIT 1`,
    [organizationId],
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  let slug = organizationSlug?.trim() || "";
  if (!slug) {
    const org = await client.query<{ slug: string }>(
      `SELECT slug FROM organization WHERE organization_id = $1`,
      [organizationId],
    );
    slug = org.rows[0]?.slug ?? "sandbox";
  }

  let agentId: string;
  const agentRow = await client.query<{ agent_id: string }>(
    `SELECT agent_id FROM agent
     WHERE organization_id = $1 AND slug = $2
     LIMIT 1`,
    [organizationId, AGENT_SLUG],
  );
  if (agentRow.rows[0]) {
    agentId = agentRow.rows[0].agent_id;
  } else {
    agentId = `agt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const did = `did:salanor:${slug}:${agentId}`;
    await client.query(
      `INSERT INTO agent (agent_id, organization_id, did, slug, display_name, environment)
       VALUES ($1, $2, $3, $4, $5, 'sandbox')`,
      [agentId, organizationId, did, AGENT_SLUG, "Sandbox default agent"],
    );
  }

  const keyId = `key_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const { publicKeyB64, privateKeyB64 } = await generateEd25519KeyPair();
  const ciphertext = encryptBridgePrivateKey(privateKeyB64);
  await client.query(
    `INSERT INTO signing_key (
       key_id, agent_id, organization_id, kms_provider, public_key_b64,
       valid_from, private_key_ciphertext, bridge_enabled, algorithm
     )
     VALUES ($1, $2, $3, 'vault', $4, now(), $5, true, 'ed25519')`,
    [keyId, agentId, organizationId, publicKeyB64, ciphertext],
  );
  return { agent_id: agentId, key_id: keyId };
}
