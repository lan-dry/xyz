/**
 * Seed demo console users + membership_bank_role for real HTTP approval theatre.
 * Demo-only — refuses unless isDemoModeAllowed() (AEGIS_DEMO_MODE=true, non-production).
 * Never call from a production seed / migrate path.
 */
import { hashPassword } from "@salanor/platform-auth";
import type pg from "pg";
import { assertDemoMode, isDemoModeAllowed } from "../bank/demo-clock.js";

/**
 * Synthetic people. Screens show "Jean Mutabazi · Credit Manager"; the .test email is
 * for sign-in and Technical details only. (admin@demo.test is created by the Demo Bank
 * fixture: display name "Theogene Rugamba".)
 */
export const DEMO_APPROVAL_ACTORS = [
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

/**
 * Deputy: no bank role of their own. Only a time-limited delegation (simulator stories)
 * lets them act as Credit Manager.
 */
export const DEMO_DEPUTY_ACTOR = {
  email: "deputy@demo.test",
  display_name: "Aimee Nyirahabimana",
  console_role: "approver",
} as const;

/** Create / refresh the deputy account and membership. Returns the membership id. */
export async function seedDemoDeputy(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string> {
  assertDemoMode("seed demo deputy");
  const passwordHash = hashPassword(demoApprovalPassword());
  const existing = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = $1`,
    [DEMO_DEPUTY_ACTOR.email],
  );
  let accountId: string;
  if (existing.rows[0]) {
    accountId = existing.rows[0].account_id;
    await client.query(
      `UPDATE account SET display_name = $2, password_hash = $3,
         email_verified_at = COALESCE(email_verified_at, now()),
         active = true, updated_at = now()
       WHERE account_id = $1`,
      [accountId, DEMO_DEPUTY_ACTOR.display_name, passwordHash],
    );
  } else {
    const inserted = await client.query<{ account_id: string }>(
      `INSERT INTO account (email, display_name, password_hash, email_verified_at, active)
       VALUES ($1, $2, $3, now(), true) RETURNING account_id`,
      [DEMO_DEPUTY_ACTOR.email, DEMO_DEPUTY_ACTOR.display_name, passwordHash],
    );
    accountId = inserted.rows[0]!.account_id;
  }
  const membership = await client.query<{ membership_id: string }>(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (organization_id, account_id) DO UPDATE SET
       role = EXCLUDED.role, status = 'active', last_active_at = now()
     RETURNING membership_id`,
    [accountId, organizationId, DEMO_DEPUTY_ACTOR.console_role],
  );
  return membership.rows[0]!.membership_id;
}

/**
 * Demo actor password — REQUIRED from AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars).
 * No known default. Refuses unless demo mode is allowed.
 */
export function demoApprovalPassword(): string {
  if (!isDemoModeAllowed()) {
    throw new Error(
      "demoApprovalPassword refused: AEGIS_DEMO_MODE is not enabled, or process is production (NODE_ENV/AEGIS_ENV)",
    );
  }
  const fromEnv = process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim();
  if (!fromEnv || fromEnv.length < 10) {
    throw new Error(
      "AEGIS_DEMO_APPROVAL_PASSWORD is required (min 10 characters). No default password is provided.",
    );
  }
  return fromEnv;
}

export async function seedDemoApprovalActors(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ emails: string[]; password: string }> {
  assertDemoMode("seed demo approval actors");
  if (!isDemoModeAllowed()) {
    throw new Error(
      "seedDemoApprovalActors refused: demo mode not allowed",
    );
  }
  const password = demoApprovalPassword();
  const passwordHash = hashPassword(password);
  const emails: string[] = [];

  for (const actor of DEMO_APPROVAL_ACTORS) {
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
