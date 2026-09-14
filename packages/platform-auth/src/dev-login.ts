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

export type VerifiedAccount = {
  accountId: string;
  email: string;
  displayName: string | null;
};

function devEnvPasswordMatches(password: string): boolean {
  return password === DEV_PASSWORD || password === DEV_PASSWORD_B;
}

/** Verify email + password without requiring an active org membership. */
export async function verifyAccountPassword(
  client: pg.Pool | pg.PoolClient,
  email: string,
  password: string,
): Promise<VerifiedAccount | null> {
  const normalized = email.trim().toLowerCase();
  const accountRow = await client.query<{
    account_id: string;
    password_hash: string | null;
    email: string;
    display_name: string | null;
  }>(
    `SELECT account_id, password_hash, email, display_name FROM account
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

  return {
    accountId: account.account_id,
    email: account.email,
    displayName: account.display_name,
  };
}

export async function pickDefaultOrganizationId(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  preferredOrganizationId?: string,
): Promise<string | null> {
  if (preferredOrganizationId) {
    const preferred = await client.query<{ organization_id: string }>(
      `SELECT organization_id FROM membership
       WHERE account_id = $1 AND organization_id = $2 AND status = 'active'`,
      [accountId, preferredOrganizationId],
    );
    if (preferred.rows[0]) {
      return preferred.rows[0].organization_id;
    }
  }

  const memberships = await client.query<{ organization_id: string }>(
    `SELECT organization_id
     FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY last_active_at DESC NULLS LAST, joined_at ASC`,
    [accountId],
  );
  return memberships.rows[0]?.organization_id ?? null;
}

export async function authenticateDevUser(
  client: pg.Pool | pg.PoolClient,
  email: string,
  password: string,
): Promise<DevLoginResult | null> {
  const verified = await verifyAccountPassword(client, email, password);
  if (!verified) {
    return null;
  }

  const organizationId = await pickDefaultOrganizationId(client, verified.accountId);
  if (!organizationId) {
    return null;
  }

  return {
    accountId: verified.accountId,
    organizationId,
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
