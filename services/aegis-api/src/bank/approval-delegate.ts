/**
 * Time-bound bank-role delegation for approval guards.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";

export type ApprovalDelegateRow = {
  delegate_id: string;
  organization_id: string;
  membership_id: string;
  role_key: string;
  expires_at: Date;
};

async function tableExists(
  client: pg.Pool | pg.PoolClient,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'approval_delegate'
     LIMIT 1`,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Active (non-revoked, not expired) delegated role keys for a membership. */
export async function listActiveDelegatedRoles(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  membershipId: string,
  now: Date = new Date(),
): Promise<string[]> {
  if (!(await tableExists(client))) return [];
  const result = await client.query<{ role_key: string }>(
    `SELECT role_key
     FROM approval_delegate
     WHERE organization_id = $1
       AND membership_id = $2
       AND revoked_at IS NULL
       AND expires_at > $3`,
    [organizationId, membershipId, now],
  );
  return result.rows.map((r) => r.role_key);
}

export async function grantApprovalDelegate(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string;
    roleKey: string;
    expiresAt: Date;
    grantedByMembershipId?: string | null;
  },
): Promise<ApprovalDelegateRow> {
  if (!(await tableExists(client))) {
    throw new Error("approval_delegate table missing; run migration 016");
  }
  const delegateId = `dlg_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const result = await client.query<ApprovalDelegateRow>(
    `INSERT INTO approval_delegate (
       delegate_id, organization_id, membership_id, role_key,
       granted_by_membership_id, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING delegate_id, organization_id, membership_id, role_key, expires_at`,
    [
      delegateId,
      input.organizationId,
      input.membershipId,
      input.roleKey,
      input.grantedByMembershipId ?? null,
      input.expiresAt,
    ],
  );
  return result.rows[0]!;
}

export async function revokeApprovalDelegate(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  delegateId: string,
): Promise<boolean> {
  if (!(await tableExists(client))) return false;
  const result = await client.query(
    `UPDATE approval_delegate
     SET revoked_at = now()
     WHERE organization_id = $1 AND delegate_id = $2 AND revoked_at IS NULL`,
    [organizationId, delegateId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Recorded on the approval vote + signed human_approval event when a delegation was relied on. */
export type DelegationRecord = {
  delegate_id: string;
  role_key: string;
  expires_at: string;
  /** The person who acted (holds the delegation). */
  delegate: { membership_id: string; name: string | null; email: string };
  /** The person who granted the delegation, if still known. */
  delegator: { membership_id: string | null; name: string | null; email: string | null };
};

export type DelegationListRow = {
  delegate_id: string;
  membership_id: string;
  delegate_name: string | null;
  delegate_email: string;
  role_key: string;
  granted_by_membership_id: string | null;
  granted_by_name: string | null;
  granted_by_email: string | null;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  status: "active" | "expired" | "revoked";
};

export function delegationStatus(
  row: { expires_at: Date; revoked_at: Date | null },
  now: Date = new Date(),
): "active" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  return row.expires_at.getTime() > now.getTime() ? "active" : "expired";
}

/** All delegations for an org (newest first) with both names resolved. */
export async function listApprovalDelegates(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  limit = 100,
): Promise<DelegationListRow[]> {
  if (!(await tableExists(client))) return [];
  const result = await client.query<Omit<DelegationListRow, "status">>(
    `SELECT d.delegate_id, d.membership_id,
            da.display_name AS delegate_name, da.email AS delegate_email,
            d.role_key, d.granted_by_membership_id,
            ga.display_name AS granted_by_name, ga.email AS granted_by_email,
            d.expires_at, d.created_at, d.revoked_at
       FROM approval_delegate d
       JOIN membership dm ON dm.membership_id = d.membership_id
       JOIN account da ON da.account_id = dm.account_id
       LEFT JOIN membership gm ON gm.membership_id = d.granted_by_membership_id
       LEFT JOIN account ga ON ga.account_id = gm.account_id
      WHERE d.organization_id = $1
      ORDER BY d.created_at DESC
      LIMIT $2`,
    [organizationId, limit],
  );
  const now = new Date();
  return result.rows.map((r) => ({ ...r, status: delegationStatus(r, now) }));
}

export async function getApprovalDelegate(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  delegateId: string,
): Promise<DelegationListRow | null> {
  const rows = await listApprovalDelegates(client, organizationId, 500);
  return rows.find((r) => r.delegate_id === delegateId) ?? null;
}

/**
 * Which active delegation (if any) is the actor relying on to satisfy `requiredRole`?
 * Returns null when a permanent bank role already satisfies the requirement.
 */
export async function findDelegationRelied(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    membershipId: string;
    requiredRole: string | null;
    permanentRoles: string[];
    satisfies: (actorRole: string, requiredRole: string) => boolean;
  },
): Promise<DelegationRecord | null> {
  if (!params.requiredRole) return null;
  if (params.permanentRoles.some((r) => params.satisfies(r, params.requiredRole!))) {
    return null;
  }
  const rows = (await listApprovalDelegates(client, params.organizationId, 200)).filter(
    (r) =>
      r.membership_id === params.membershipId &&
      r.status === "active" &&
      params.satisfies(r.role_key, params.requiredRole!),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    delegate_id: row.delegate_id,
    role_key: row.role_key,
    expires_at: row.expires_at.toISOString(),
    delegate: {
      membership_id: row.membership_id,
      name: row.delegate_name?.trim() || null,
      email: row.delegate_email,
    },
    delegator: {
      membership_id: row.granted_by_membership_id,
      name: row.granted_by_name?.trim() || null,
      email: row.granted_by_email,
    },
  };
}
