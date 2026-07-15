import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";

export type IngestKeyRow = {
  key_id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  active: boolean;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

export function hashIngestKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function generateIngestKey(): { rawKey: string; prefix: string } {
  const rawKey = `aegis_${randomBytes(24).toString("hex")}`;
  const prefix = rawKey.slice(0, 8);
  return { rawKey, prefix };
}

export async function listIngestKeys(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<IngestKeyRow[]> {
  const result = await client.query<IngestKeyRow>(
    `SELECT key_id, organization_id, name, key_prefix, active, created_at, last_used_at, revoked_at
     FROM ingest_api_key
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId],
  );
  return result.rows;
}

export async function createIngestKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  name: string,
): Promise<{ row: IngestKeyRow; rawKey: string }> {
  const { rawKey, prefix } = generateIngestKey();
  const keyHash = hashIngestKey(rawKey);
  const result = await client.query<IngestKeyRow>(
    `INSERT INTO ingest_api_key (organization_id, name, key_prefix, key_hash, active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING key_id, organization_id, name, key_prefix, active, created_at, last_used_at, revoked_at`,
    [organizationId, name, prefix, keyHash],
  );
  return { row: result.rows[0]!, rawKey };
}

export async function renameIngestKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  keyId: string,
  name: string,
): Promise<IngestKeyRow | null> {
  const result = await client.query<IngestKeyRow>(
    `UPDATE ingest_api_key
     SET name = $3
     WHERE key_id = $1 AND organization_id = $2 AND active = true
     RETURNING key_id, organization_id, name, key_prefix, active, created_at, last_used_at, revoked_at`,
    [keyId, organizationId, name],
  );
  return result.rows[0] ?? null;
}

export async function revokeIngestKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  keyId: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE ingest_api_key
     SET active = false, revoked_at = now()
     WHERE key_id = $1 AND organization_id = $2 AND active = true`,
    [keyId, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}
