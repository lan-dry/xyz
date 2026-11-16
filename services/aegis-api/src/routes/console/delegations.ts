/**
 * Time-bound bank-role delegation (approval_delegate).
 *
 *   GET    /v1/console/delegations
 *   POST   /v1/console/delegations        { membership_id, role_key, expires_at | duration_minutes }
 *   DELETE /v1/console/delegations/:id
 *
 * Grant: a console admin, or a person who permanently holds the role (or a higher one).
 * Revoke: a console admin, a Credit Manager or higher, or the person who granted it.
 * The signed approval receipt later names both people (see delegationRelied).
 */
import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import {
  getApprovalDelegate,
  grantApprovalDelegate,
  listApprovalDelegates,
  revokeApprovalDelegate,
} from "../../bank/approval-delegate.js";
import { roleSatisfies } from "../../bank/authority-matrix.js";
import { listBankRoleLadder, listMembershipBankRoles } from "../../bank/repo.js";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const delegationRoutes = new Hono<{ Variables: ConsoleVariables }>();

const MIN_MINUTES = 1;
const MAX_MINUTES = 60 * 24 * 30;
/** Minimum role allowed to revoke someone else's delegation (besides console admins). */
export const DELEGATION_REVOKER_ROLE = "credit_manager";

export function resolveExpiry(
  body: { expires_at?: string; duration_minutes?: number },
  now: Date = new Date(),
): Date | { error: string } {
  let expires: Date;
  if (typeof body.duration_minutes === "number" && Number.isFinite(body.duration_minutes)) {
    expires = new Date(now.getTime() + Math.round(body.duration_minutes) * 60_000);
  } else if (typeof body.expires_at === "string") {
    expires = new Date(body.expires_at);
  } else {
    return { error: "expires_at or duration_minutes required" };
  }
  if (Number.isNaN(expires.getTime())) return { error: "expires_at is not a valid date" };
  const minutes = (expires.getTime() - now.getTime()) / 60_000;
  if (minutes < MIN_MINUTES) return { error: "A delegation must end in the future" };
  if (minutes > MAX_MINUTES) return { error: "A delegation can last at most 30 days" };
  return expires;
}

delegationRoutes.get("/delegations", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const pool = getPool();
  const [delegations, ladder, mine, members] = await Promise.all([
    listApprovalDelegates(pool, session.organizationId),
    listBankRoleLadder(pool, session.organizationId).catch(() => []),
    listMembershipBankRoles(pool, session.organizationId, session.userId).catch(
      () => [] as string[],
    ),
    pool.query<{
      membership_id: string;
      email: string;
      display_name: string | null;
      role: string;
      roles: string[] | null;
    }>(
      `SELECT m.membership_id, a.email, a.display_name, m.role,
              (SELECT array_agg(br.role_key ORDER BY br.role_key)
                 FROM membership_bank_role br
                WHERE br.membership_id = m.membership_id) AS roles
         FROM membership m
         JOIN account a ON a.account_id = m.account_id
        WHERE m.organization_id = $1 AND m.status = 'active'
        ORDER BY a.display_name NULLS LAST, a.email`,
      [session.organizationId],
    ).catch(() => ({ rows: [] as never[] })),
  ]);

  const isAdmin = session.role === "admin";
  const canRevokeOthers =
    isAdmin || mine.some((r) => roleSatisfies(ladder, r, DELEGATION_REVOKER_ROLE));
  return c.json({
    me: { membership_id: session.userId, bank_roles: mine, is_admin: isAdmin },
    can_grant_roles: ladder
      .filter((r) => isAdmin || mine.some((m) => roleSatisfies(ladder, m, r.role_key)))
      .map((r) => ({ role_key: r.role_key, display_name: r.display_name })),
    can_revoke_others: canRevokeOthers,
    roles: ladder.map((r) => ({ role_key: r.role_key, display_name: r.display_name })),
    members: members.rows.map((m) => ({
      membership_id: m.membership_id,
      name: m.display_name?.trim() || null,
      email: m.email,
      console_role: m.role,
      bank_roles: m.roles ?? [],
    })),
    delegations: delegations.map((d) => ({
      delegate_id: d.delegate_id,
      status: d.status,
      role_key: d.role_key,
      delegate: {
        membership_id: d.membership_id,
        name: d.delegate_name?.trim() || null,
        email: d.delegate_email,
      },
      granted_by: {
        membership_id: d.granted_by_membership_id,
        name: d.granted_by_name?.trim() || null,
        email: d.granted_by_email,
      },
      expires_at: d.expires_at.toISOString(),
      created_at: d.created_at.toISOString(),
      revoked_at: d.revoked_at?.toISOString() ?? null,
      can_revoke:
        d.status === "active" &&
        (canRevokeOthers || d.granted_by_membership_id === session.userId),
    })),
  });
});

delegationRoutes.post("/delegations", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  let body: {
    membership_id?: string;
    role_key?: string;
    expires_at?: string;
    duration_minutes?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const membershipId = body.membership_id?.trim();
  const roleKey = body.role_key?.trim();
  if (!membershipId || !roleKey) {
    return c.json({ error: "membership_id and role_key required" }, 422);
  }
  if (membershipId === session.userId) {
    return c.json({ error: "You cannot delegate to yourself" }, 422);
  }
  const expiry = resolveExpiry(body);
  if (!(expiry instanceof Date)) return c.json({ error: expiry.error }, 422);

  const pool = getPool();
  const ladder = await listBankRoleLadder(pool, session.organizationId).catch(() => []);
  if (!ladder.some((r) => r.role_key === roleKey)) {
    return c.json({ error: "Unknown role for this organisation" }, 422);
  }
  const mine = await listMembershipBankRoles(
    pool,
    session.organizationId,
    session.userId,
  ).catch(() => [] as string[]);
  const isAdmin = session.role === "admin";
  if (!isAdmin && !mine.some((m) => roleSatisfies(ladder, m, roleKey))) {
    return c.json(
      { error: "You can only delegate a role you hold (or a lower one)." },
      403,
    );
  }
  const target = await pool.query<{ display_name: string | null; email: string }>(
    `SELECT a.display_name, a.email
       FROM membership m JOIN account a ON a.account_id = m.account_id
      WHERE m.organization_id = $1 AND m.membership_id = $2 AND m.status = 'active'`,
    [session.organizationId, membershipId],
  );
  if (!target.rows[0]) return c.json({ error: "Member not found" }, 404);

  const row = await grantApprovalDelegate(pool, {
    organizationId: session.organizationId,
    membershipId,
    roleKey,
    expiresAt: expiry,
    grantedByMembershipId: session.userId,
  });
  await auditFromConsoleSession(pool, session, {
    action: "delegation.granted",
    resourceType: "approval_delegate",
    resourceId: row.delegate_id,
    metadata: {
      role_key: roleKey,
      delegate_email: target.rows[0].email,
      delegate_name: target.rows[0].display_name,
      expires_at: expiry.toISOString(),
    },
  });
  return c.json(
    {
      delegate_id: row.delegate_id,
      role_key: row.role_key,
      expires_at: row.expires_at.toISOString(),
    },
    201,
  );
});

delegationRoutes.delete("/delegations/:delegateId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const delegateId = c.req.param("delegateId") ?? "";
  const pool = getPool();
  const existing = await getApprovalDelegate(pool, session.organizationId, delegateId);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.status !== "active") {
    return c.json({ error: `Delegation already ${existing.status}` }, 409);
  }
  const ladder = await listBankRoleLadder(pool, session.organizationId).catch(() => []);
  const mine = await listMembershipBankRoles(
    pool,
    session.organizationId,
    session.userId,
  ).catch(() => [] as string[]);
  const allowed =
    session.role === "admin" ||
    existing.granted_by_membership_id === session.userId ||
    mine.some((r) => roleSatisfies(ladder, r, DELEGATION_REVOKER_ROLE));
  if (!allowed) {
    return c.json(
      { error: "Only an admin, a Credit Manager (or higher) or the grantor can revoke." },
      403,
    );
  }
  const ok = await revokeApprovalDelegate(pool, session.organizationId, delegateId);
  if (!ok) return c.json({ error: "Not found" }, 404);
  await auditFromConsoleSession(pool, session, {
    action: "delegation.revoked",
    resourceType: "approval_delegate",
    resourceId: delegateId,
    metadata: {
      role_key: existing.role_key,
      delegate_email: existing.delegate_email,
    },
  });
  return c.json({ ok: true });
});
