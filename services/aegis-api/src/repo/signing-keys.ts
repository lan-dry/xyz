import type pg from "pg";
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
