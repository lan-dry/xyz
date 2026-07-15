import { randomUUID } from "node:crypto";
import type pg from "pg";
import { createAgentWithSigningKey, type AgentCredentials } from "./agent-provisioning.js";
import { hashInviteToken } from "./invite-token.js";
import { hashPassword } from "./password.js";

export type OrgRole = "admin" | "engineer" | "auditor" | "viewer";

export type OrganizationRow = {
  organization_id: string;
  name: string;
  slug: string;
  needs_onboarding: boolean;
};

export type MembershipRow = {
  membership_id: string;
  account_id: string;
  organization_id: string;
  role: OrgRole;
  status: string;
  email: string;
  display_name: string | null;
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listOrganizationsForAccount(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<OrganizationRow[]> {
  const result = await client.query<OrganizationRow>(
    `SELECT o.organization_id, o.name, o.slug,
            (o.onboarding_completed_at IS NULL) AS needs_onboarding
     FROM membership m
     JOIN organization o ON o.organization_id = m.organization_id
     WHERE m.account_id = $1 AND m.status = 'active' AND o.active = true
     ORDER BY o.name`,
    [accountId],
  );
  return result.rows;
}

export async function getMembershipForAccountOrg(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  organizationId: string,
): Promise<MembershipRow | null> {
  const result = await client.query<MembershipRow>(
    `SELECT m.membership_id, m.account_id, m.organization_id, m.role, m.status,
            a.email, a.display_name
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.account_id = $1 AND m.organization_id = $2 AND m.status = 'active'
       AND a.active = true`,
    [accountId, organizationId],
  );
  return result.rows[0] ?? null;
}

export class MemberRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberRoleError";
  }
}

export async function updateMemberRole(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string;
    role: OrgRole;
    actorMembershipId: string;
    actorAccountId: string;
  },
): Promise<MembershipRow> {
  const allowed: OrgRole[] = ["admin", "engineer", "auditor", "viewer"];
  if (!allowed.includes(input.role)) {
    throw new MemberRoleError("Invalid role");
  }

  const member = await getMembershipById(client, input.membershipId);
  if (!member || member.organization_id !== input.organizationId) {
    throw new MemberRoleError("Member not found");
  }

  if (member.role === "admin" && input.role !== "admin") {
    const admins = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM membership
       WHERE organization_id = $1 AND role = 'admin' AND status = 'active'`,
      [input.organizationId],
    );
    if (Number(admins.rows[0]?.n ?? 0) <= 1) {
      throw new MemberRoleError("Cannot change role of the only admin");
    }
  }

  await client.query(
    `UPDATE membership SET role = $1 WHERE membership_id = $2`,
    [input.role, input.membershipId],
  );

  await writeAuditEvent(client, {
    organizationId: input.organizationId,
    membershipId: input.actorMembershipId,
    action: "membership.role_changed",
    resourceType: "membership",
    resourceId: input.membershipId,
    metadata: {
      from_role: member.role,
      to_role: input.role,
      email: member.email,
      actor_account_id: input.actorAccountId,
    },
  });

  const updated = await getMembershipById(client, input.membershipId);
  if (!updated) {
    throw new MemberRoleError("Member not found after update");
  }
  return updated;
}

export async function getMembershipById(
  client: pg.Pool | pg.PoolClient,
  membershipId: string,
): Promise<MembershipRow | null> {
  const result = await client.query<MembershipRow>(
    `SELECT m.membership_id, m.account_id, m.organization_id, m.role, m.status,
            a.email, a.display_name
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.membership_id = $1 AND m.status = 'active' AND a.active = true`,
    [membershipId],
  );
  return result.rows[0] ?? null;
}

export type OrgMemberRow = {
  membership_id: string;
  email: string;
  display_name: string | null;
  role: OrgRole;
  status: string;
  joined_at: string;
};

export async function listMembersInOrg(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  options?: { limit: number; offset: number },
): Promise<{ members: OrgMemberRow[]; total: number }> {
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM membership m
     WHERE m.organization_id = $1`,
    [organizationId],
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const params: unknown[] = [organizationId];
  let limitSql = "";
  if (options) {
    params.push(options.limit, options.offset);
    limitSql = ` LIMIT $2 OFFSET $3`;
  }

  const result = await client.query<{
    membership_id: string;
    email: string;
    display_name: string | null;
    role: OrgRole;
    status: string;
    joined_at: Date;
  }>(
    `SELECT m.membership_id, a.email, a.display_name, m.role, m.status, m.joined_at
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1
     ORDER BY a.email${limitSql}`,
    params,
  );
  const members = result.rows.map((r) => ({
    ...r,
    joined_at: r.joined_at.toISOString(),
  }));
  return { members, total };
}

export async function listPendingInvitations(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<
  {
    invitation_id: string;
    email: string;
    role: OrgRole;
    status: string;
    expires_at: string;
    created_at: string;
    invited_by_email: string | null;
  }[]
> {
  const result = await client.query<{
    invitation_id: string;
    email: string;
    role: OrgRole;
    status: string;
    expires_at: Date;
    created_at: Date;
    invited_by_email: string | null;
  }>(
    `SELECT i.invitation_id, i.email, i.role, i.status, i.expires_at, i.created_at,
            inviter.email AS invited_by_email
     FROM organization_invitation i
     LEFT JOIN membership im ON im.membership_id = i.invited_by
     LEFT JOIN account inviter ON inviter.account_id = im.account_id
     WHERE i.organization_id = $1 AND i.status = 'pending' AND i.expires_at > now()
     ORDER BY i.created_at DESC`,
    [organizationId],
  );
  return result.rows.map((r) => ({
    invitation_id: r.invitation_id,
    email: r.email,
    role: r.role,
    status: r.status,
    expires_at: r.expires_at.toISOString(),
    created_at: r.created_at.toISOString(),
    invited_by_email: r.invited_by_email,
  }));
}

export async function createOrganizationInvitation(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    email: string;
    role: OrgRole;
    invitedByMembershipId: string;
    token: string;
  },
): Promise<{ invitation_id: string; expires_at: Date }> {
  const { assertCanAddMember } = await import("./plans.js");
  await assertCanAddMember(client, input.organizationId);

  const normalized = input.email.trim().toLowerCase();
  const existing = await client.query<{ membership_id: string }>(
    `SELECT m.membership_id
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1 AND lower(a.email) = $2 AND m.status = 'active'`,
    [input.organizationId, normalized],
  );
  if (existing.rows[0]) {
    throw new InviteError("already_member", "This email is already a member");
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const tokenHash = hashInviteToken(input.token);

  try {
    const inserted = await client.query<{ invitation_id: string; expires_at: Date }>(
      `INSERT INTO organization_invitation (
         organization_id, email, role, token_hash, invited_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING invitation_id, expires_at`,
      [
        input.organizationId,
        normalized,
        input.role,
        tokenHash,
        input.invitedByMembershipId,
        expiresAt,
      ],
    );
    const row = inserted.rows[0];
    if (!row) {
      throw new Error("Failed to create invitation");
    }
    return row;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      throw new InviteError("pending_exists", "A pending invite already exists for this email");
    }
    throw err;
  }
}

export async function revokeInvitation(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  invitationId: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE organization_invitation
     SET status = 'revoked'
     WHERE invitation_id = $1 AND organization_id = $2 AND status = 'pending'`,
    [invitationId, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type InvitePreview = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  email: string;
  role: OrgRole;
  expires_at: string;
};

export async function previewInvitation(
  client: pg.Pool | pg.PoolClient,
  token: string,
): Promise<InvitePreview | null> {
  const tokenHash = hashInviteToken(token);
  const result = await client.query<{
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    email: string;
    role: OrgRole;
    expires_at: Date;
    status: string;
  }>(
    `SELECT i.organization_id, o.name AS organization_name, o.slug AS organization_slug,
            i.email, i.role, i.expires_at, i.status
     FROM organization_invitation i
     JOIN organization o ON o.organization_id = i.organization_id
     WHERE i.token_hash = $1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  if (row.status !== "pending" || row.expires_at <= new Date()) {
    return null;
  }
  return {
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    organization_slug: row.organization_slug,
    email: row.email,
    role: row.role,
    expires_at: row.expires_at.toISOString(),
  };
}

export async function accountExistsForEmail(
  client: pg.Pool | pg.PoolClient,
  email: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM account WHERE lower(email) = $1 AND active = true
     ) AS exists`,
    [email.trim().toLowerCase()],
  );
  return result.rows[0]?.exists ?? false;
}

/** Accept invite and create a new account (invite email must not already have an account). */
export async function acceptInvitationWithNewAccount(
  client: pg.Pool | pg.PoolClient,
  token: string,
  displayName: string | null,
  passwordHash: string,
): Promise<{ accountId: string; organizationId: string; membershipId: string }> {
  const tokenHash = hashInviteToken(token);
  const invite = await client.query<{
    invitation_id: string;
    organization_id: string;
    email: string;
    role: OrgRole;
    status: string;
    expires_at: Date;
  }>(
    `SELECT invitation_id, organization_id, email, role, status, expires_at
     FROM organization_invitation
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  );
  const row = invite.rows[0];
  if (!row || row.status !== "pending") {
    throw new InviteError("invalid", "Invitation is invalid or no longer available");
  }
  if (row.expires_at <= new Date()) {
    await client.query(
      `UPDATE organization_invitation SET status = 'expired' WHERE invitation_id = $1`,
      [row.invitation_id],
    );
    throw new InviteError("expired", "Invitation has expired");
  }

  const exists = await accountExistsForEmail(client, row.email);
  if (exists) {
    throw new InviteError(
      "account_exists",
      "An account already exists for this email — sign in to accept the invitation",
    );
  }

  const accountInsert = await client.query<{ account_id: string }>(
    `INSERT INTO account (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING account_id`,
    [row.email, displayName, passwordHash],
  );
  const accountId = accountInsert.rows[0]?.account_id;
  if (!accountId) {
    throw new Error("Failed to create account");
  }

  // Invites are sent to a specific email address; treat the invited email as
  // already verified to avoid an immediate redirect loop back to
  // `/verify-email-sent` after the user sets their password.
  await client.query(
    `UPDATE account
     SET email_verified_at = now(),
         updated_at = now()
     WHERE account_id = $1`,
    [accountId],
  );
  // Best-effort cleanup (token may not exist yet).
  await client.query(`DELETE FROM email_verification_token WHERE account_id = $1`, [
    accountId,
  ]);

  const accepted = await acceptInvitation(client, token, accountId);
  return { accountId, ...accepted };
}

export async function acceptInvitation(
  client: pg.Pool | pg.PoolClient,
  token: string,
  accountId: string,
): Promise<{ organizationId: string; membershipId: string }> {
  const tokenHash = hashInviteToken(token);
  const invite = await client.query<{
    invitation_id: string;
    organization_id: string;
    email: string;
    role: OrgRole;
    status: string;
    expires_at: Date;
  }>(
    `SELECT invitation_id, organization_id, email, role, status, expires_at
     FROM organization_invitation
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  );
  const row = invite.rows[0];
  if (!row || row.status !== "pending") {
    throw new InviteError("invalid", "Invitation is invalid or no longer available");
  }
  if (row.expires_at <= new Date()) {
    await client.query(
      `UPDATE organization_invitation SET status = 'expired' WHERE invitation_id = $1`,
      [row.invitation_id],
    );
    throw new InviteError("expired", "Invitation has expired");
  }

  const account = await client.query<{ email: string }>(
    `SELECT email FROM account WHERE account_id = $1 AND active = true`,
    [accountId],
  );
  const acct = account.rows[0];
  if (!acct || acct.email.toLowerCase() !== row.email.toLowerCase()) {
    throw new InviteError(
      "email_mismatch",
      "Sign in with the email address that received this invitation",
    );
  }

  const existing = await client.query<{ membership_id: string }>(
    `SELECT membership_id FROM membership
     WHERE organization_id = $1 AND account_id = $2`,
    [row.organization_id, accountId],
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE organization_invitation
       SET status = 'accepted', accepted_at = now()
       WHERE invitation_id = $1`,
      [row.invitation_id],
    );
    return {
      organizationId: row.organization_id,
      membershipId: existing.rows[0].membership_id,
    };
  }

  const { assertCanAddMember } = await import("./plans.js");
  await assertCanAddMember(client, row.organization_id);

  const inserted = await client.query<{ membership_id: string }>(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING membership_id`,
    [accountId, row.organization_id, row.role],
  );
  const membershipId = inserted.rows[0]?.membership_id;
  if (!membershipId) {
    throw new Error("Failed to create membership");
  }

  await client.query(
    `UPDATE organization_invitation
     SET status = 'accepted', accepted_at = now()
     WHERE invitation_id = $1`,
    [row.invitation_id],
  );

  await client.query(
    `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'invitation.accepted', 'membership', $3, $4::jsonb)`,
    [
      row.organization_id,
      membershipId,
      membershipId,
      JSON.stringify({ email: row.email, role: row.role }),
    ],
  );

  return { organizationId: row.organization_id, membershipId };
}

export async function writeAuditEvent(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.organizationId,
      input.membershipId,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export async function provisionOrganization(
  client: pg.Pool | pg.PoolClient,
  input: {
    name: string;
    slug: string;
    adminEmail: string;
    adminDisplayName?: string | null;
    adminPasswordHash?: string | null;
    plan?: string;
    /** When true, user must complete /onboarding (company name + slug) before console use. */
    deferOnboarding?: boolean;
  },
): Promise<{
  organization_id: string;
  account_id: string;
  membership_id: string;
  default_agent: AgentCredentials;
}> {
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const email = input.adminEmail.trim().toLowerCase();

  const plan = (input.plan?.trim() || "free").toLowerCase();
  const planOk = await client.query(`SELECT 1 FROM plan_catalog WHERE plan_slug = $1 AND active`, [
    plan,
  ]);
  if (!planOk.rows[0]) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  const onboardingAt = input.deferOnboarding ? null : new Date();
  const orgInsert = await client.query<{ organization_id: string }>(
    `INSERT INTO organization (name, slug, plan, onboarding_completed_at)
     VALUES ($1, $2, $3, $4) RETURNING organization_id`,
    [input.name.trim(), slug, plan, onboardingAt],
  );
  const organizationId = orgInsert.rows[0]?.organization_id;
  if (!organizationId) {
    throw new Error("Failed to create organization");
  }

  let accountId: string;
  const existingAccount = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = $1`,
    [email],
  );
  if (existingAccount.rows[0]) {
    accountId = existingAccount.rows[0].account_id;
    if (input.adminPasswordHash) {
      await client.query(
        `UPDATE account SET password_hash = $1, display_name = COALESCE($2, display_name), updated_at = now()
         WHERE account_id = $3`,
        [input.adminPasswordHash, input.adminDisplayName ?? null, accountId],
      );
    }
  } else {
    const acct = await client.query<{ account_id: string }>(
      `INSERT INTO account (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING account_id`,
      [email, input.adminDisplayName ?? null, input.adminPasswordHash ?? null],
    );
    accountId = acct.rows[0]!.account_id;
  }

  const membership = await client.query<{ membership_id: string }>(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (organization_id, account_id) DO UPDATE SET role = 'admin', status = 'active'
     RETURNING membership_id`,
    [accountId, organizationId],
  );

  const membershipId = membership.rows[0]!.membership_id;

  await client.query(
    `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, 'organization.provisioned', 'organization', $3, $4::jsonb)`,
    [
      organizationId,
      membershipId,
      organizationId,
      JSON.stringify({ slug, admin_email: email }),
    ],
  );

  const default_agent = await createAgentWithSigningKey(client, {
    organizationId,
    organizationSlug: slug,
    auditActorId: membershipId,
  });

  return {
    organization_id: organizationId,
    account_id: accountId,
    membership_id: membershipId,
    default_agent,
  };
}

export class RegisterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RegisterError";
  }
}

function slugifyOrgName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : `org-${randomUUID().slice(0, 8)}`;
}

/** Self-serve: new account + organization + default agent (production customer path). */
export async function registerSelfServeOrganization(
  client: pg.Pool | pg.PoolClient,
  input: {
    email: string;
    password: string;
    organizationName: string;
    organizationSlug?: string;
    displayName?: string | null;
  },
): Promise<{
  organization_id: string;
  account_id: string;
  membership_id: string;
  organization_slug: string;
  default_agent: {
    agent_id: string;
    key_id: string;
    organization_id: string;
    organization_slug: string;
    public_key_b64: string;
    private_key_b64: string;
    did: string;
  };
}> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < 10) {
    throw new RegisterError("weak_password", "Password must be at least 10 characters");
  }

  const taken = await client.query(
    `SELECT 1 FROM account WHERE lower(email) = $1`,
    [email],
  );
  if (taken.rows[0]) {
    throw new RegisterError("email_taken", "An account with this email already exists");
  }

  const slug = (input.organizationSlug?.trim() || slugifyOrgName(input.organizationName))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

  const hash = hashPassword(input.password);
  const result = await provisionOrganization(client, {
    name: input.organizationName.trim(),
    slug,
    adminEmail: email,
    adminDisplayName: input.displayName ?? null,
    adminPasswordHash: hash,
    plan: "free",
  });

  await client.query(
    `UPDATE account SET email_verified_at = NULL WHERE account_id = $1`,
    [result.account_id],
  );

  return {
    organization_id: result.organization_id,
    account_id: result.account_id,
    membership_id: result.membership_id,
    organization_slug: slug,
    default_agent: result.default_agent,
  };
}

/** Logged-in user creates an additional organization (admin on the new org). */
export async function createOrganizationForAccount(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  input: {
    organizationName: string;
    organizationSlug?: string;
  },
): Promise<{
  organization_id: string;
  organization_slug: string;
  name: string;
  membership_id: string;
}> {
  const acct = await client.query<{ email: string; display_name: string | null }>(
    `SELECT email, display_name FROM account WHERE account_id = $1 AND active = true`,
    [accountId],
  );
  const row = acct.rows[0];
  if (!row) {
    throw new RegisterError("not_found", "Account not found");
  }

  const slug = (input.organizationSlug?.trim() || slugifyOrgName(input.organizationName))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

  const result = await provisionOrganization(client, {
    name: input.organizationName.trim(),
    slug,
    adminEmail: row.email,
    adminDisplayName: row.display_name,
    plan: "free",
  });

  return {
    organization_id: result.organization_id,
    organization_slug: slug,
    name: input.organizationName.trim(),
    membership_id: result.membership_id,
  };
}

export class InviteError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InviteError";
  }
}
