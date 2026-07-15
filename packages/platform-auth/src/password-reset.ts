import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { hashPassword } from "./password.js";

const RESET_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Always returns true when account exists (no email enumeration). */
export async function createPasswordResetToken(
  client: pg.Pool | pg.PoolClient,
  email: string,
): Promise<{ token: string; accountId: string } | null> {
  const account = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account
     WHERE lower(email) = lower($1) AND active = true`,
    [email.trim()],
  );
  const accountId = account.rows[0]?.account_id;
  if (!accountId) {
    return null;
  }

  const token = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await client.query(
    `DELETE FROM password_reset_token WHERE account_id = $1`,
    [accountId],
  );
  await client.query(
    `INSERT INTO password_reset_token (token_hash, account_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, accountId, expiresAt],
  );

  return { token, accountId };
}

export async function resetPasswordWithToken(
  client: pg.Pool | pg.PoolClient,
  token: string,
  newPassword: string,
): Promise<string | null> {
  const tokenHash = hashPasswordResetToken(token);
  const row = await client.query<{ account_id: string }>(
    `SELECT account_id FROM password_reset_token
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  const accountId = row.rows[0]?.account_id;
  if (!accountId) {
    return null;
  }

  const passwordHash = await hashPassword(newPassword);
  await client.query(
    `UPDATE account SET password_hash = $1, updated_at = now() WHERE account_id = $2`,
    [passwordHash, accountId],
  );
  await client.query(`DELETE FROM password_reset_token WHERE account_id = $1`, [
    accountId,
  ]);
  return accountId;
}
