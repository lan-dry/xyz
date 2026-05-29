import type pg from "pg";
import { hashPassword, verifyPassword } from "./password.js";

/** Legacy shared dev passwords (local only) — used when account has no password_hash yet. */
const DEV_PASSWORD =
  process.env.DEV_CONSOLE_PASSWORD_ORG_A ?? "dev-admin-change-me";
const DEV_PASSWORD_B =
  process.env.DEV_CONSOLE_PASSWORD_ORG_B ?? "dev-b-admin-change-me";

export type DevLoginResult = {
  accountId: string;
  organizationId: string;
};

function devEnvPasswordMatches(password: string): boolean {
  return password === DEV_PASSWORD || password === DEV_PASSWORD_B;
}

export async function authenticateDevUser(
  client: pg.Pool | pg.PoolClient,
  email: string,
  password: string,
): Promise<DevLoginResult | null> {
  const normalized = email.trim().toLowerCase();
  const accountRow = await client.query<{
    account_id: string;
    password_hash: string | null;
  }>(
    `SELECT account_id, password_hash FROM account
     WHERE lower(email) = $1 AND active = true`,
    [normalized],
  );
  const account = accountRow.rows[0];
  if (!account) {
    return null;
  }

  let passwordOk = false;
  if (account.password_hash) {
    passwordOk = verifyPassword(password, account.password_hash);
  } else if (devEnvPasswordMatches(password)) {
    passwordOk = true;
    const hash = hashPassword(password);
    await client.query(
      `UPDATE account SET password_hash = $1, updated_at = now() WHERE account_id = $2`,
      [hash, account.account_id],
    );
  }

  if (!passwordOk) {
    return null;
  }

  const memberships = await client.query<{
    organization_id: string;
    last_active_at: Date | null;
    joined_at: Date;
  }>(
    `SELECT organization_id, last_active_at, joined_at
     FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY last_active_at DESC NULLS LAST, joined_at ASC`,
    [account.account_id],
  );
  const membership = memberships.rows[0];
  if (!membership) {
    return null;
  }

  return {
    accountId: account.account_id,
    organizationId: membership.organization_id,
  };
}

export async function setAccountPassword(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  password: string,
): Promise<void> {
  const hash = hashPassword(password);
  await client.query(
    `UPDATE account SET password_hash = $1, updated_at = now() WHERE account_id = $2`,
    [hash, accountId],
  );
}
