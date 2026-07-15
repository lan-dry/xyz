import type pg from "pg";
import {
  getMembershipForAccountOrg,
  writeAuditEvent,
  type MembershipRow,
} from "./identity.js";
import { type PlatformRole } from "./platform-roles.js";
import { writePlatformAuditEvent } from "./platform-staff.js";
import {
  generateSessionToken,
  hashSessionToken,
  mapSessionFromRow,
  resolveSessionRow,
  type ConsoleSession,
} from "./session.js";

export class ImpersonationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpersonationError";
  }
}

const PLATFORM_AUDIT_ORG_SLUG = "salanor-platform";

async function getOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ organization_id: string; name: string; slug: string; active: boolean } | null> {
  const result = await client.query<{
    organization_id: string;
    name: string;
    slug: string;
    active: boolean;
  }>(
    `SELECT organization_id, name, slug, active FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return result.rows[0] ?? null;
}

async function ensureSupportMembership(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  organizationId: string,
): Promise<MembershipRow> {
  const existing = await getMembershipForAccountOrg(client, accountId, organizationId);
  if (existing) {
    return existing;
  }

  const inserted = await client.query<MembershipRow>(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, 'auditor', 'active')
     RETURNING membership_id, account_id, organization_id, role, status,
               (SELECT email FROM account WHERE account_id = $1) AS email,
               (SELECT display_name FROM account WHERE account_id = $1) AS display_name`,
    [accountId, organizationId],
  );
  const row = inserted.rows[0];
  if (!row) {
    throw new ImpersonationError("Failed to create support membership");
  }
  return row;
}

export async function startImpersonation(
  client: pg.Pool | pg.PoolClient,
  input: {
    currentToken: string;
    organizationId: string;
    actorAccountId: string;
    actorPlatformRole: PlatformRole;
  },
): Promise<{ token: string; session: ConsoleSession; organization: { name: string; slug: string } }> {
  let activeToken = input.currentToken;
  let current = await resolveSessionRow(client, activeToken);
  if (!current) {
    throw new ImpersonationError("Invalid session");
  }
  if (current.impersonator_account_id) {
    const ended = await endImpersonation(client, activeToken);
    activeToken = ended.token;
    current = await resolveSessionRow(client, activeToken);
    if (!current) {
      throw new ImpersonationError("Invalid session after ending impersonation");
    }
  }
  if (current.account_id !== input.actorAccountId) {
    throw new ImpersonationError("Session account mismatch");
  }

  const org = await getOrganization(client, input.organizationId);
  if (!org) {
    throw new ImpersonationError("Organization not found");
  }
  if (!org.active) {
    throw new ImpersonationError("Organization is suspended");
  }
  if (org.slug === PLATFORM_AUDIT_ORG_SLUG) {
    throw new ImpersonationError("Cannot impersonate the platform system organization");
  }

  const membership = await ensureSupportMembership(client, input.actorAccountId, input.organizationId);
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const startedAt = new Date();

  const inserted = await client.query<{ session_id: string }>(
    `INSERT INTO session (
       account_id, membership_id, organization_id, token_hash, expires_at,
       impersonator_account_id, parent_session_id, impersonation_started_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING session_id`,
    [
      input.actorAccountId,
      membership.membership_id,
      input.organizationId,
      tokenHash,
      expiresAt,
      input.actorAccountId,
      current.session_id,
      startedAt,
    ],
  );

  const sessionId = inserted.rows[0]?.session_id;
  if (!sessionId) {
    throw new ImpersonationError("Failed to create impersonation session");
  }

  const session: ConsoleSession = {
    sessionId,
    accountId: input.actorAccountId,
    userId: membership.membership_id,
    organizationId: input.organizationId,
    email: membership.email,
    displayName: membership.display_name,
    role: membership.role,
    impersonation: {
      impersonatorAccountId: input.actorAccountId,
      impersonatorEmail: membership.email,
      impersonatorPlatformRole: input.actorPlatformRole,
      startedAt: startedAt.toISOString(),
    },
  };

  await writePlatformAuditEvent(client, {
    actorAccountId: input.actorAccountId,
    action: "platform.impersonation.started",
    resourceType: "organization",
    resourceId: input.organizationId,
    metadata: {
      target_organization_id: input.organizationId,
      target_org_name: org.name,
      target_org_slug: org.slug,
      effective_role: membership.role,
      parent_session_id: current.session_id,
      impersonation_session_id: sessionId,
    },
  });

  await writeAuditEvent(client, {
    organizationId: input.organizationId,
    membershipId: membership.membership_id,
    action: "support.impersonation.started",
    resourceType: "organization",
    resourceId: input.organizationId,
    metadata: {
      scope: "platform",
      actor_account_id: input.actorAccountId,
      actor_email: membership.email,
      actor_platform_role: input.actorPlatformRole,
      effective_role: membership.role,
      impersonation_session_id: sessionId,
    },
  });

  return { token, session, organization: { name: org.name, slug: org.slug } };
}

export async function endImpersonation(
  client: pg.Pool | pg.PoolClient,
  currentToken: string,
): Promise<{ token: string; session: ConsoleSession }> {
  const current = await resolveSessionRow(client, currentToken);
  if (!current) {
    throw new ImpersonationError("Invalid session");
  }
  if (!current.impersonator_account_id || !current.parent_session_id) {
    throw new ImpersonationError("Not in an impersonation session");
  }

  const org = await getOrganization(client, current.organization_id);
  const parent = await client.query<{
    session_id: string;
    account_id: string;
    membership_id: string;
    organization_id: string;
    email: string;
    display_name: string | null;
    role: string;
    impersonator_account_id: string | null;
    parent_session_id: string | null;
    impersonation_started_at: Date | null;
    impersonator_email: string | null;
    impersonator_platform_role: string | null;
  }>(
    `SELECT s.session_id, s.account_id, s.membership_id, s.organization_id,
            a.email, a.display_name, m.role,
            s.impersonator_account_id, s.parent_session_id, s.impersonation_started_at,
            NULL::text AS impersonator_email, NULL::text AS impersonator_platform_role
     FROM session s
     JOIN membership m ON m.membership_id = s.membership_id
     JOIN account a ON a.account_id = s.account_id
     WHERE s.session_id = $1 AND s.expires_at > now() AND m.status = 'active' AND a.active = true`,
    [current.parent_session_id],
  );
  const parentRow = parent.rows[0];
  if (!parentRow) {
    await client.query(`DELETE FROM session WHERE session_id = $1`, [current.session_id]);
    throw new ImpersonationError("Original session expired; sign in again");
  }

  const actorAccountId = current.impersonator_account_id;
  const actorEmail = current.impersonator_email ?? "";

  await client.query(`DELETE FROM session WHERE session_id = $1`, [current.session_id]);

  const restoredToken = generateSessionToken();
  const restoredHash = hashSessionToken(restoredToken);
  await client.query(`UPDATE session SET token_hash = $1 WHERE session_id = $2`, [
    restoredHash,
    parentRow.session_id,
  ]);

  const session = mapSessionFromRow(parentRow);

  await writePlatformAuditEvent(client, {
    actorAccountId,
    action: "platform.impersonation.ended",
    resourceType: "organization",
    resourceId: current.organization_id,
    metadata: {
      target_organization_id: current.organization_id,
      target_org_name: org?.name ?? null,
      target_org_slug: org?.slug ?? null,
      parent_session_id: parentRow.session_id,
    },
  });

  if (org) {
    await writeAuditEvent(client, {
      organizationId: current.organization_id,
      membershipId: current.membership_id,
      action: "support.impersonation.ended",
      resourceType: "organization",
      resourceId: current.organization_id,
      metadata: {
        scope: "platform",
        actor_account_id: actorAccountId,
        actor_email: actorEmail,
      },
    });
  }

  return { token: restoredToken, session };
}
