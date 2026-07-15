import type pg from "pg";
import {
  canActorAssignPlatformRole,
  isPlatformRole,
  platformRoleHasPermission,
  type PlatformPermission,
  type PlatformRole,
} from "./platform-roles.js";
import { resolveSession, SALANOR_SESSION_COOKIE, type ConsoleSession } from "./session.js";

export type PlatformStaffSession = ConsoleSession & {
  platform_role: PlatformRole;
};

export class PlatformRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformRoleError";
  }
}

const PLATFORM_AUDIT_ORG_SLUG = "salanor-platform";

export async function getAccountPlatformRole(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<PlatformRole | null> {
  const result = await client.query<{ platform_role: string | null }>(
    `SELECT platform_role FROM account WHERE account_id = $1 AND active = true`,
    [accountId],
  );
  const role = result.rows[0]?.platform_role ?? null;
  return isPlatformRole(role) ? role : null;
}

/** @deprecated Use getAccountPlatformRole — true when platform_role IS NOT NULL */
export async function isPlatformStaff(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<boolean> {
  return (await getAccountPlatformRole(client, accountId)) != null;
}

/** Resolve browser session only if account has a platform role. */
export async function resolvePlatformStaffSession(
  client: pg.Pool | pg.PoolClient,
  sessionToken: string | undefined,
): Promise<PlatformStaffSession | null> {
  if (!sessionToken) {
    return null;
  }
  const session = await resolveSession(client, sessionToken);
  if (!session) {
    return null;
  }
  const platformRole = await getAccountPlatformRole(client, session.accountId);
  if (!platformRole) {
    return null;
  }
  return { ...session, platform_role: platformRole };
}

export function sessionHasPlatformPermission(
  session: PlatformStaffSession,
  permission: PlatformPermission,
): boolean {
  return platformRoleHasPermission(session.platform_role, permission);
}

export async function countSuperAdmins(client: pg.Pool | pg.PoolClient): Promise<number> {
  const result = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM account WHERE platform_role = 'superadmin' AND active = true`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function getPlatformAuditOrganizationId(
  client: pg.Pool | pg.PoolClient,
): Promise<string | null> {
  const result = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1 LIMIT 1`,
    [PLATFORM_AUDIT_ORG_SLUG],
  );
  return result.rows[0]?.organization_id ?? null;
}

export async function writePlatformAuditEvent(
  client: pg.Pool | pg.PoolClient,
  input: {
    actorAccountId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const organizationId = await getPlatformAuditOrganizationId(client);
  if (!organizationId) {
    console.warn("[platform-auth] platform audit org missing; run migration 013");
    return;
  }

  const actor = await client.query<{ email: string; platform_role: string | null }>(
    `SELECT email, platform_role FROM account WHERE account_id = $1`,
    [input.actorAccountId],
  );
  const actorEmail = actor.rows[0]?.email ?? null;
  const actorPlatformRole = actor.rows[0]?.platform_role ?? null;

  await client.query(
    `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, NULL, $2, $3, $4, $5::jsonb)`,
    [
      organizationId,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      JSON.stringify({
        scope: "platform",
        actor_account_id: input.actorAccountId,
        actor_email: actorEmail,
        actor_platform_role: actorPlatformRole,
        ...input.metadata,
      }),
    ],
  );
}

export async function setAccountPlatformRole(
  client: pg.Pool | pg.PoolClient,
  input: {
    accountId: string;
    platformRole: PlatformRole | null;
    actorAccountId: string;
    actorPlatformRole: PlatformRole;
  },
): Promise<{ platform_role: PlatformRole | null }> {
  const current = await getAccountPlatformRole(client, input.accountId);
  const assignment = canActorAssignPlatformRole(
    input.actorPlatformRole,
    current,
    input.platformRole,
  );
  if (!assignment.allowed) {
    throw new PlatformRoleError(assignment.reason ?? "Forbidden");
  }

  if (current === input.platformRole) {
    return { platform_role: current };
  }

  if (current === "superadmin" && input.platformRole !== "superadmin") {
    const supers = await countSuperAdmins(client);
    if (supers <= 1) {
      throw new PlatformRoleError("Cannot remove the last super admin");
    }
  }
  if (
    input.accountId === input.actorAccountId &&
    current === "superadmin" &&
    input.platformRole !== "superadmin"
  ) {
    const supers = await countSuperAdmins(client);
    if (supers <= 1) {
      throw new PlatformRoleError("You cannot demote yourself as the last super admin");
    }
  }

  const target = await client.query<{ email: string }>(
    `SELECT email FROM account WHERE account_id = $1`,
    [input.accountId],
  );

  await client.query(
    `UPDATE account SET platform_role = $1, updated_at = now() WHERE account_id = $2`,
    [input.platformRole, input.accountId],
  );

  await writePlatformAuditEvent(client, {
    actorAccountId: input.actorAccountId,
    action: "platform.role.changed",
    resourceType: "account",
    resourceId: input.accountId,
    metadata: {
      target_account_id: input.accountId,
      target_email: target.rows[0]?.email ?? null,
      previous_role: current,
      new_role: input.platformRole,
    },
  });

  return { platform_role: input.platformRole };
}

export { SALANOR_SESSION_COOKIE };

