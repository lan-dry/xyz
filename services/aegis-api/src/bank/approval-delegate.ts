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
