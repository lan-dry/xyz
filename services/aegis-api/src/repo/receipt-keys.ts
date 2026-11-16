/**
 * Published receipt signing keys (public side only).
 * A key_id maps to exactly one public key. For production custody (kms,
 * software_interim) a different public key under an existing key_id is refused.
 */
import { createHash } from "node:crypto";
import type pg from "pg";
import type { KeyCustody, ReceiptSigning } from "../crypto/receipt-signing.js";

export type PublishedReceiptKey = {
  key_id: string;
  alg: "ed25519";
  public_key_b64: string;
  fingerprint: string;
  custody: KeyCustody;
  status: "active" | "retired";
  created_at: string;
  retired_at: string | null;
};

export function fingerprintOfPublicKey(publicKeyB64: string): string {
  return `sha256:${createHash("sha256")
    .update(Buffer.from(publicKeyB64, "base64"))
    .digest("hex")}`;
}

const publishedThisProcess = new Set<string>();

/** Test hook. */
export function resetPublishedReceiptKeyCacheForTests(): void {
  publishedThisProcess.clear();
}

/**
 * Record the signing key's public half (idempotent, once per process per key).
 * Throws when an existing production-custody key_id would change its public key.
 */
export async function publishReceiptSigningKey(
  client: pg.Pool | pg.PoolClient,
  signing: Pick<ReceiptSigning, "key_id" | "custody" | "publicKeyB64">,
): Promise<void> {
  const publicKeyB64 = await signing.publicKeyB64();
  const cacheKey = `${signing.key_id}|${signing.custody}|${publicKeyB64}`;
  if (publishedThisProcess.has(cacheKey)) return;

  const fingerprint = fingerprintOfPublicKey(publicKeyB64);
  const inserted = await client.query(
    `INSERT INTO receipt_signing_key (key_id, custody, public_key_b64, fingerprint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key_id) DO NOTHING`,
    [signing.key_id, signing.custody, publicKeyB64, fingerprint],
  );
  if ((inserted.rowCount ?? 0) === 0) {
    const existing = await client.query<{
      public_key_b64: string;
      custody: KeyCustody;
    }>(
      `SELECT public_key_b64, custody FROM receipt_signing_key WHERE key_id = $1`,
      [signing.key_id],
    );
    const row = existing.rows[0];
    if (row && row.public_key_b64 !== publicKeyB64) {
      if (row.custody === "software" && signing.custody === "software") {
        // Dev/test keys are throwaway: allow the key id to be re-pointed.
        await client.query(
          `UPDATE receipt_signing_key
           SET public_key_b64 = $2, fingerprint = $3
           WHERE key_id = $1`,
          [signing.key_id, publicKeyB64, fingerprint],
        );
      } else {
        throw new Error(
          `Receipt key id ${signing.key_id} is already published with a different public key; use a new AEGIS_RECEIPT_KEY_ID when rotating`,
        );
      }
    } else if (row && row.custody !== signing.custody) {
      await client.query(
        `UPDATE receipt_signing_key SET custody = $2 WHERE key_id = $1`,
        [signing.key_id, signing.custody],
      );
    }
  }
  publishedThisProcess.add(cacheKey);
}

export async function listPublishedReceiptKeys(
  client: pg.Pool | pg.PoolClient,
): Promise<PublishedReceiptKey[]> {
  const result = await client.query<{
    key_id: string;
    custody: KeyCustody;
    public_key_b64: string;
    fingerprint: string;
    status: "active" | "retired";
    created_at: Date;
    retired_at: Date | null;
  }>(
    `SELECT key_id, custody, public_key_b64, fingerprint, status, created_at, retired_at
     FROM receipt_signing_key
     ORDER BY created_at ASC`,
  );
  return result.rows.map((r) => ({
    key_id: r.key_id,
    alg: "ed25519" as const,
    public_key_b64: r.public_key_b64,
    fingerprint: r.fingerprint,
    custody: r.custody,
    status: r.status,
    created_at: r.created_at.toISOString(),
    retired_at: r.retired_at ? r.retired_at.toISOString() : null,
  }));
}

/** Mark a key retired (it stays published so old receipts keep verifying). */
export async function retireReceiptSigningKey(
  client: pg.Pool | pg.PoolClient,
  keyId: string,
): Promise<boolean> {
  const r = await client.query(
    `UPDATE receipt_signing_key
     SET status = 'retired', retired_at = now()
     WHERE key_id = $1 AND status = 'active'`,
    [keyId],
  );
  return (r.rowCount ?? 0) > 0;
}
