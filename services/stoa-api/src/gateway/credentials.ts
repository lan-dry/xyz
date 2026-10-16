import { createHash, randomBytes } from "node:crypto";
import { getPool } from "../db/pool.js";

export type GatewayCredentialRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const KEY_PREFIX = "stg_";

export function hashGatewayKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateGatewayKey(): { raw: string; prefix: string; hash: string } {
  const body = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${body}`;
  return {
    raw,
    prefix: raw.slice(0, 12),
    hash: hashGatewayKey(raw),
  };
}

export async function listGatewayCredentials(
  tenantId: string,
): Promise<GatewayCredentialRow[]> {
  const result = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
     FROM stoa_gateway_credential
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.key_prefix,
    createdAt: r.created_at.toISOString(),
    lastUsedAt: r.last_used_at?.toISOString() ?? null,
    revokedAt: r.revoked_at?.toISOString() ?? null,
  }));
}

export async function createGatewayCredential(input: {
  tenantId: string;
  name: string;
  createdByUserId: string;
}): Promise<{ credential: GatewayCredentialRow; apiKey: string }> {
  const { raw, prefix, hash } = generateGatewayKey();
  const result = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: Date;
  }>(
    `INSERT INTO stoa_gateway_credential
       (tenant_id, name, key_prefix, key_hash, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, key_prefix, created_at`,
    [input.tenantId, input.name.trim(), prefix, hash, input.createdByUserId],
  );
  const row = result.rows[0]!;
  return {
    apiKey: raw,
    credential: {
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    },
  };
}

export async function revokeGatewayCredential(
  tenantId: string,
  credentialId: string,
): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE stoa_gateway_credential
     SET revoked_at = now()
     WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [credentialId, tenantId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function resolveGatewayCredential(
  rawKey: string,
): Promise<{ tenantId: string; credentialId: string; userId: string } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) {
    return null;
  }
  const hash = hashGatewayKey(rawKey);
  const pool = getPool();
  const cred = await pool.query<{
    id: string;
    tenant_id: string;
  }>(
    `SELECT id, tenant_id FROM stoa_gateway_credential
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
  const row = cred.rows[0];
  if (!row) {
    return null;
  }

  await pool.query(
    `UPDATE stoa_gateway_credential SET last_used_at = now() WHERE id = $1`,
    [row.id],
  );

  const externalId = `__gateway__@${row.tenant_id.slice(0, 8)}.internal`;
  const userRow = await pool.query<{ id: string }>(
    `INSERT INTO stoa_user (tenant_id, external_id, display_name)
     VALUES ($1, $2, 'Gateway service')
     ON CONFLICT (tenant_id, external_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [row.tenant_id, externalId],
  );
  const userId = userRow.rows[0]?.id;
  if (!userId) {
    return null;
  }

  return {
    tenantId: row.tenant_id,
    credentialId: row.id,
    userId,
  };
}
