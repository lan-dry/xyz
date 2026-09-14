import type pg from "pg";
import { writeAuditEvent } from "./identity.js";

export type ConsoleAuditActor = {
  organizationId: string;
  membershipId: string | null;
  email?: string;
};

export async function auditConsoleEvent(
  client: pg.Pool | pg.PoolClient,
  actor: ConsoleAuditActor,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const metadata: Record<string, unknown> = { ...input.metadata };
  if (actor.email) {
    metadata.actor_email = actor.email;
  }
  await writeAuditEvent(client, {
    organizationId: actor.organizationId,
    membershipId: actor.membershipId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
}

export async function resolveLoginAuditContext(
  client: pg.Pool | pg.PoolClient,
  email: string,
  preferredOrganizationId?: string,
): Promise<{ organizationId: string; membershipId: string | null } | null> {
  const acct = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = lower($1) AND active = true`,
    [email.trim()],
  );
  const accountId = acct.rows[0]?.account_id;
  if (!accountId) {
    return null;
  }

  if (preferredOrganizationId) {
    const preferred = await client.query<{ membership_id: string }>(
      `SELECT membership_id FROM membership
       WHERE account_id = $1 AND organization_id = $2 AND status = 'active'`,
      [accountId, preferredOrganizationId],
    );
    if (preferred.rows[0]) {
      return {
        organizationId: preferredOrganizationId,
        membershipId: preferred.rows[0].membership_id,
      };
    }
  }

  const membership = await client.query<{
    membership_id: string;
    organization_id: string;
  }>(
    `SELECT membership_id, organization_id FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY joined_at ASC
     LIMIT 1`,
    [accountId],
  );
  const row = membership.rows[0];
  if (!row) {
    return null;
  }
  return {
    organizationId: row.organization_id,
    membershipId: row.membership_id,
  };
}

export async function resolveAuditContextForAccount(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<{ organizationId: string; membershipId: string | null } | null> {
  const membership = await client.query<{
    membership_id: string;
    organization_id: string;
  }>(
    `SELECT membership_id, organization_id FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY joined_at ASC
     LIMIT 1`,
    [accountId],
  );
  const row = membership.rows[0];
  if (!row) {
    return null;
  }
  return {
    organizationId: row.organization_id,
    membershipId: row.membership_id,
  };
}

export async function auditAuthLoginSuccess(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string;
    email: string;
    source?: string;
    ip?: string;
  },
): Promise<void> {
  await auditConsoleEvent(
    client,
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      email: input.email,
    },
    {
      action: "auth.login.success",
      resourceType: "session",
      resourceId: input.membershipId,
      metadata: {
        source: input.source ?? "salanor-id",
        ...(input.ip ? { ip: input.ip } : {}),
      },
    },
  );
}

export async function auditAuthLoginFailed(
  client: pg.Pool | pg.PoolClient,
  input: {
    email: string;
    reason: string;
    organizationId?: string;
    preferredOrganizationId?: string;
    ip?: string;
  },
): Promise<void> {
  const ctx =
    input.organizationId && input.preferredOrganizationId
      ? {
          organizationId: input.organizationId,
          membershipId: null as string | null,
        }
      : await resolveLoginAuditContext(
          client,
          input.email,
          input.preferredOrganizationId,
        );
  if (!ctx) {
    return;
  }
  await auditConsoleEvent(
    client,
    { organizationId: ctx.organizationId, membershipId: ctx.membershipId, email: input.email },
    {
      action: "auth.login.failed",
      resourceType: "account",
      metadata: {
        reason: input.reason,
        ...(input.ip ? { ip: input.ip } : {}),
      },
    },
  );
}

export async function auditAuthLoginDenied(
  client: pg.Pool | pg.PoolClient,
  input: {
    email: string;
    reason: string;
    code?: string;
    organizationId?: string;
    membershipId?: string | null;
    ip?: string;
  },
): Promise<void> {
  let orgId = input.organizationId;
  let membershipId = input.membershipId ?? null;
  if (!orgId) {
    const ctx = await resolveLoginAuditContext(client, input.email);
    if (!ctx) return;
    orgId = ctx.organizationId;
    membershipId = ctx.membershipId;
  }
  await auditConsoleEvent(
    client,
    { organizationId: orgId, membershipId, email: input.email },
    {
      action: "auth.login.denied",
      resourceType: "account",
      metadata: {
        reason: input.reason,
        ...(input.code ? { code: input.code } : {}),
        ...(input.ip ? { ip: input.ip } : {}),
      },
    },
  );
}

export async function auditAuthLogout(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string;
    email: string;
    source?: string;
  },
): Promise<void> {
  await auditConsoleEvent(
    client,
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      email: input.email,
    },
    {
      action: "auth.logout",
      resourceType: "session",
      resourceId: input.membershipId,
      metadata: { source: input.source ?? "salanor-id" },
    },
  );
}
