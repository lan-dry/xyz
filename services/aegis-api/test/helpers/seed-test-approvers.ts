/**
 * Test-only approver seed (replaces removed seedDemoApprovalActors / AEGIS_DEMO_MODE path).
 * Reason: integration tests need bank-role memberships without runtime demo mode.
 */
import { hashPassword } from "@salanor/platform-auth";
import type pg from "pg";

export const TEST_APPROVAL_ACTORS = [
  {
    email: "officer@demo.test",
    display_name: "Patience Ingabire",
    console_role: "approver",
    bank_role: "credit_officer",
  },
  {
    email: "manager@demo.test",
    display_name: "Jean Mutabazi",
    console_role: "approver",
    bank_role: "credit_manager",
  },
  {
    email: "comp@demo.test",
    display_name: "Diane Uwizeye",
    console_role: "approver",
    bank_role: "compliance_officer",
  },
  {
    email: "head@demo.test",
    display_name: "Olivier Kayitesi",
    console_role: "approver",
    bank_role: "head_of_compliance",
  },
  {
    email: "dpo@demo.test",
    display_name: "Sandra Murekatete",
    console_role: "approver",
    bank_role: "dpo",
  },
] as const;

export function testApprovalPassword(): string {
  const fromEnv = process.env.AEGIS_TEST_APPROVAL_PASSWORD?.trim();
  if (fromEnv && fromEnv.length >= 10) return fromEnv;
  return "test-approver-password-ok";
}

export async function seedTestApprovalActors(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ emails: string[]; password: string }> {
  const password = testApprovalPassword();
  const passwordHash = hashPassword(password);
  const emails: string[] = [];

  for (const actor of TEST_APPROVAL_ACTORS) {
    const existing = await client.query<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = $1`,
      [actor.email],
    );
    let accountId: string;
    if (existing.rows[0]) {
      accountId = existing.rows[0].account_id;
      await client.query(
        `UPDATE account SET
           display_name = $2,
           password_hash = $3,
           email_verified_at = COALESCE(email_verified_at, now()),
           active = true,
           updated_at = now()
         WHERE account_id = $1`,
        [accountId, actor.display_name, passwordHash],
      );
    } else {
      const inserted = await client.query<{ account_id: string }>(
        `INSERT INTO account (email, display_name, password_hash, email_verified_at, active)
         VALUES ($1, $2, $3, now(), true)
         RETURNING account_id`,
        [actor.email, actor.display_name, passwordHash],
      );
      accountId = inserted.rows[0]!.account_id;
    }

    const membership = await client.query<{ membership_id: string }>(
      `INSERT INTO membership (account_id, organization_id, role, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (organization_id, account_id) DO UPDATE SET
         role = EXCLUDED.role,
         status = 'active'
       RETURNING membership_id`,
      [accountId, organizationId, actor.console_role],
    );
    const membershipId = membership.rows[0]!.membership_id;

    await client.query(
      `INSERT INTO membership_bank_role (membership_id, organization_id, role_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (membership_id, role_key) DO NOTHING`,
      [membershipId, organizationId, actor.bank_role],
    );
    emails.push(actor.email);
  }

  return { emails, password };
}
