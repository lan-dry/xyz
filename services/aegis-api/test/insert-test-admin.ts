import { randomUUID } from "node:crypto";
import type pg from "pg";
import { hashPassword } from "@salanor/platform-auth";

export type InsertTestAdminResult = {
  email: string;
  accountId: string;
  membershipId: string;
};

/** Vitest-only ephemeral admin — not bootstrap, not documented for humans. */
export async function insertTestAdmin(
  client: pg.Pool | pg.PoolClient,
  opts: {
    organizationId: string;
    membershipId?: string;
    password: string;
  },
): Promise<InsertTestAdminResult> {
  const accountId = randomUUID();
  const membershipId = opts.membershipId ?? randomUUID();
  const email = `vitest-${accountId.replace(/-/g, "")}@local.invalid`;
  const hash = hashPassword(opts.password);

  await client.query(
    `INSERT INTO account (account_id, email, display_name, password_hash, email_verified_at, active)
     VALUES ($1, $2, 'Vitest admin', $3, now(), true)`,
    [accountId, email, hash],
  );
  await client.query(
    `INSERT INTO membership (membership_id, account_id, organization_id, role, status)
     VALUES ($1, $2, $3, 'admin', 'active')
     ON CONFLICT (membership_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       status = 'active'`,
    [membershipId, accountId, opts.organizationId],
  );

  return { email, accountId, membershipId };
}
