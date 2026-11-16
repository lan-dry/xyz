import { createHash } from "node:crypto";
import type pg from "pg";

/** Same algorithm as aegis-api repo/ingest-keys.ts hashIngestKey (sha256 hex of the raw key). */
function hashIngestKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export const MIN_STABLE_INGEST_KEY_LENGTH = 32;

export class DemoIngestKeyError extends Error {
  constructor(
    readonly code: "not_found" | "not_demo_or_test" | "weak_secret" | "bad_name",
    message: string,
  ) {
    super(message);
    this.name = "DemoIngestKeyError";
  }
}

export type DemoIngestKeyResult = {
  key_id: string;
  key_prefix: string;
  /** created = new row; reused = identical active key already stored; replaced = other key revoked. */
  action: "created" | "reused" | "replaced";
};

/**
 * Platform-only (bootstrap secret) way to give a DEMO or TEST tenant an ingest key whose secret
 * the operator already holds (`DEMO_BANK_INGEST_KEY`), so the key stays STABLE across
 * `pnpm demo:fresh`. Only the sha256 hash is stored, exactly like a normally minted key.
 *
 * Idempotent: the same secret again returns the existing row; a different secret for the same
 * key name revokes the old key and stores the new hash. Never mints a random key, never runs for a
 * customer tenant (neither is_demo nor is_test).
 */
export async function platformSetStableIngestKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  input: { name: string; secret: string },
): Promise<DemoIngestKeyResult> {
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new DemoIngestKeyError("bad_name", "name is required (max 120 characters)");
  }
  const secret = input.secret.trim();
  if (secret.length < MIN_STABLE_INGEST_KEY_LENGTH || /\s/.test(secret)) {
    throw new DemoIngestKeyError(
      "weak_secret",
      `secret must be at least ${MIN_STABLE_INGEST_KEY_LENGTH} characters, no whitespace`,
    );
  }

  const org = await client.query<{ is_demo: boolean; is_test: boolean }>(
    `SELECT is_demo, is_test FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  if (!org.rows[0]) throw new DemoIngestKeyError("not_found", "organization not found");
  if (!org.rows[0].is_demo && !org.rows[0].is_test) {
    throw new DemoIngestKeyError(
      "not_demo_or_test",
      "stable ingest keys can only be set on demo or test organisations",
    );
  }

  const hash = hashIngestKey(secret);
  const prefix = secret.slice(0, 8);

  const active = await client.query<{ key_id: string; key_hash: string; key_prefix: string }>(
    `SELECT key_id, key_hash, key_prefix FROM ingest_api_key
      WHERE organization_id = $1 AND name = $2 AND active = true`,
    [organizationId, name],
  );
  const same = active.rows.find((r) => r.key_hash === hash);
  if (same) {
    // Revoke any other active key with this name (there should be none).
    await client.query(
      `UPDATE ingest_api_key SET active = false, revoked_at = now()
        WHERE organization_id = $1 AND name = $2 AND active = true AND key_id <> $3`,
      [organizationId, name, same.key_id],
    );
    return { key_id: same.key_id, key_prefix: same.key_prefix, action: "reused" };
  }

  if (active.rows.length > 0) {
    await client.query(
      `UPDATE ingest_api_key SET active = false, revoked_at = now()
        WHERE organization_id = $1 AND name = $2 AND active = true`,
      [organizationId, name],
    );
  }
  const inserted = await client.query<{ key_id: string }>(
    `INSERT INTO ingest_api_key (organization_id, name, key_prefix, key_hash, active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING key_id`,
    [organizationId, name, prefix, hash],
  );
  return {
    key_id: inserted.rows[0]!.key_id,
    key_prefix: prefix,
    action: active.rows.length > 0 ? "replaced" : "created",
  };
}
