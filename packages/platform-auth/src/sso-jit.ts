import type pg from "pg";

export type SsoOrgContext = {
  organization_id: string;
  workos_organization_id: string;
  jit_provision: boolean;
};

export async function resolveSsoOrganizationBySlug(
  client: pg.Pool | pg.PoolClient,
  slug: string,
): Promise<SsoOrgContext | null> {
  const row = await client.query<SsoOrgContext>(
    `SELECT o.organization_id, s.workos_organization_id, COALESCE(s.jit_provision, false) AS jit_provision
     FROM organization_sso s
     JOIN organization o ON o.organization_id = s.organization_id
     WHERE o.slug = $1 AND s.enabled = true AND s.provider = 'workos'`,
    [slug.trim().toLowerCase()],
  );
  return row.rows[0] ?? null;
}

/**
 * First SSO login: create account (no password) + active membership when JIT is enabled for the org.
 */
export async function provisionJitSsoMember(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    email: string;
    displayName?: string | null;
    defaultRole?: "viewer" | "engineer";
  },
): Promise<{ account_id: string; membership_id: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const role = input.defaultRole ?? "engineer";

  let accountId: string;
  const existing = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = $1`,
    [email],
  );
  let created = false;

  if (existing.rows[0]) {
    accountId = existing.rows[0].account_id;
    await client.query(
      `UPDATE account SET active = true, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
       WHERE account_id = $1`,
      [accountId],
    );
  } else {
    const ins = await client.query<{ account_id: string }>(
      `INSERT INTO account (email, display_name, password_hash, email_verified_at)
       VALUES ($1, $2, NULL, now())
       RETURNING account_id`,
      [email, input.displayName?.trim() || null],
    );
    accountId = ins.rows[0]!.account_id;
    created = true;
  }

  const membership = await client.query<{ membership_id: string }>(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (organization_id, account_id) DO UPDATE SET status = 'active', role = EXCLUDED.role
     RETURNING membership_id`,
    [accountId, input.organizationId, role],
  );

  await client.query(
    `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'membership.sso_jit', 'account', $3, $4::jsonb)`,
    [
      input.organizationId,
      membership.rows[0]?.membership_id ?? null,
      accountId,
      JSON.stringify({ email, role, created }),
    ],
  );

  return {
    account_id: accountId,
    membership_id: membership.rows[0]!.membership_id,
    created,
  };
}
