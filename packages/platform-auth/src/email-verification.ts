import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export function generateEmailVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createEmailVerificationToken(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<string> {
  const token = generateEmailVerificationToken();
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);

  await client.query(`DELETE FROM email_verification_token WHERE account_id = $1`, [
    accountId,
  ]);
  await client.query(
    `INSERT INTO email_verification_token (token_hash, account_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, accountId, expiresAt],
  );

  return token;
}

export async function verifyEmailWithToken(
  client: pg.Pool | pg.PoolClient,
  token: string,
): Promise<{ accountId: string; organizationId: string } | null> {
  const tokenHash = hashEmailVerificationToken(token);
  const row = await client.query<{ account_id: string }>(
    `SELECT account_id FROM email_verification_token
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  const accountId = row.rows[0]?.account_id;
  if (!accountId) {
    return null;
  }

  await client.query(
    `UPDATE account SET email_verified_at = now(), updated_at = now() WHERE account_id = $1`,
    [accountId],
  );
  await client.query(`DELETE FROM email_verification_token WHERE account_id = $1`, [
    accountId,
  ]);

  const membership = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY joined_at ASC LIMIT 1`,
    [accountId],
  );
  const organizationId = membership.rows[0]?.organization_id;
  if (!organizationId) {
    return null;
  }

  return { accountId, organizationId };
}

export async function isEmailVerified(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<boolean> {
  const row = await client.query<{ email_verified_at: Date | null }>(
    `SELECT email_verified_at FROM account WHERE account_id = $1`,
    [accountId],
  );
  return row.rows[0]?.email_verified_at != null;
}
