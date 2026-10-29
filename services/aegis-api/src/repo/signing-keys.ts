import type pg from "pg";
import { randomUUID } from "node:crypto";
import { generateEd25519KeyPair } from "@salanor/platform-auth";
import { encryptBridgePrivateKey } from "../crypto/bridge-key-vault.js";
import type { SigningKeyMaterial } from "../crypto/signing-provider.js";

export async function getSigningKeyMaterial(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  keyId: string,
): Promise<SigningKeyMaterial | null> {
  const result = await client.query<SigningKeyMaterial>(
    `SELECT key_id, kms_provider, kms_key_arn, public_key_b64, private_key_ciphertext
     FROM signing_key
     WHERE organization_id = $1 AND key_id = $2 AND revoked = false`,
    [organizationId, keyId],
  );
  return result.rows[0] ?? null;
}

export async function registerByokSigningKey(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    agentId: string;
    publicKeyB64: string;
    kmsProvider: "customer" | "aws" | "gcp" | "vault";
    kmsKeyArn?: string | null;
  },
): Promise<{ key_id: string }> {
  const { randomUUID } = await import("node:crypto");
  const keyId = `key_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  await client.query(
    `INSERT INTO signing_key (
       key_id, agent_id, organization_id, kms_provider, kms_key_arn,
       public_key_b64, algorithm, valid_from
     ) VALUES ($1, $2, $3, $4, $5, $6, 'ed25519', now())`,
    [
      keyId,
      input.agentId,
      input.organizationId,
      input.kmsProvider,
      input.kmsKeyArn ?? null,
      input.publicKeyB64,
    ],
  );
  return { key_id: keyId };
}

export async function revokeSigningKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  keyId: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE signing_key
     SET revoked = true
     WHERE organization_id = $1 AND key_id = $2 AND revoked = false
     RETURNING key_id`,
    [organizationId, keyId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function recordSigningKeyRotation(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    agentId: string;
    previousKeyId: string | null;
    newKeyId: string;
    reason?: string;
    actorMembershipId?: string | null;
  },
): Promise<string> {
  const rotationId = `rot_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await client.query(
    `INSERT INTO signing_key_rotation (
       rotation_id, organization_id, agent_id, previous_key_id, new_key_id,
       reason, actor_membership_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      rotationId,
      input.organizationId,
      input.agentId,
      input.previousKeyId,
      input.newKeyId,
      input.reason ?? null,
      input.actorMembershipId ?? null,
    ],
  );
  return rotationId;
}

export async function listSigningKeyRotations(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  limit = 50,
): Promise<
  Array<{
    rotation_id: string;
    agent_id: string;
    previous_key_id: string | null;
    new_key_id: string;
    reason: string | null;
    created_at: Date;
  }>
> {
  const result = await client.query(
    `SELECT rotation_id, agent_id, previous_key_id, new_key_id, reason, created_at
     FROM signing_key_rotation
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, limit],
  );
  return result.rows as Array<{
    rotation_id: string;
    agent_id: string;
    previous_key_id: string | null;
    new_key_id: string;
    reason: string | null;
    created_at: Date;
  }>;
}

/**
 * Resolve a server-signable key for a human approval attestation.
 * Customer-held event keys stay customer-held; Aegis creates a separate encrypted
 * control-plane key for the same agent when no KMS or server key is available.
 */
export async function getOrCreateApprovalSigningKeyId(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  agentId: string,
  preferredKeyId: string,
): Promise<string> {
  const preferred = await client.query<{ key_id: string }>(
    `SELECT key_id
     FROM signing_key
     WHERE organization_id = $1
       AND agent_id = $2
       AND key_id = $3
       AND revoked = false
       AND (
         private_key_ciphertext IS NOT NULL
         OR (kms_provider IN ('aws', 'gcp', 'vault') AND kms_key_arn IS NOT NULL)
       )
     LIMIT 1`,
    [organizationId, agentId, preferredKeyId],
  );
  if (preferred.rows[0]) {
    return preferred.rows[0].key_id;
  }

  const existing = await client.query<{ key_id: string }>(
    `SELECT key_id
     FROM signing_key
     WHERE organization_id = $1
       AND agent_id = $2
       AND revoked = false
       AND private_key_ciphertext IS NOT NULL
       AND kms_provider = 'vault'
       AND bridge_enabled = false
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationId, agentId],
  );
  if (existing.rows[0]) {
    return existing.rows[0].key_id;
  }

  const keyId = `key_approval_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { publicKeyB64, privateKeyB64 } = await generateEd25519KeyPair();
  const privateKeyCiphertext = encryptBridgePrivateKey(privateKeyB64);
  await client.query(
    `INSERT INTO signing_key (
       key_id, agent_id, organization_id, kms_provider, public_key_b64,
       private_key_ciphertext, bridge_enabled, algorithm, valid_from
     ) VALUES ($1, $2, $3, 'vault', $4, $5, false, 'ed25519', now())`,
    [keyId, agentId, organizationId, publicKeyB64, privateKeyCiphertext],
  );
  return keyId;
}
