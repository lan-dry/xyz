import type pg from "pg";

export async function logReceiptAccess(
  client: pg.Pool | pg.PoolClient,
  input: {
    organization_id: string;
    receipt_id: string;
    actor_membership_id?: string | null;
    actor_email?: string | null;
    action?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO receipt_access_log (
       organization_id, receipt_id, actor_membership_id, actor_email, action
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.organization_id,
      input.receipt_id,
      input.actor_membership_id ?? null,
      input.actor_email ?? null,
      input.action ?? "view",
    ],
  );
}

export async function listReceiptAccess(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  receiptId: string,
  limit = 50,
): Promise<
  Array<{
    access_id: string;
    actor_email: string | null;
    action: string;
    created_at: Date;
  }>
> {
  const result = await client.query<{
    access_id: string;
    actor_email: string | null;
    action: string;
    created_at: Date;
  }>(
    `SELECT access_id, actor_email, action, created_at
     FROM receipt_access_log
     WHERE organization_id = $1 AND receipt_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [organizationId, receiptId, limit],
  );
  return result.rows;
}
