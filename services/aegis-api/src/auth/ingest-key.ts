import type pg from "pg";
import { hashIngestKey } from "../repo/ingest-keys.js";

export type IngestAuth = {
  organizationId: string;
  keyId: string;
};

export { hashIngestKey };

export async function resolveIngestKey(
  client: pg.Pool | pg.PoolClient,
  bearerToken: string,
): Promise<IngestAuth | null> {
  const keyHash = hashIngestKey(bearerToken.trim());
  const result = await client.query<{
    organization_id: string;
    key_id: string;
  }>(
    `SELECT organization_id, key_id
     FROM ingest_api_key
     WHERE key_hash = $1 AND active = true AND revoked_at IS NULL`,
    [keyHash],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    organizationId: row.organization_id,
    keyId: row.key_id,
  };
}
