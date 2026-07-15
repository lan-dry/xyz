import type pg from "pg";

/**
 * Remove incomplete OAuth placeholder orgs when the user signs out of onboarding.
 * Prevents orphaned `pending-*` tenants and allows a clean re-signup with the same email.
 */
export async function cleanupAbandonedPendingOrganizations(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<{ removed_org_ids: string[]; account_removed: boolean }> {
  const pendingOrgs = await client.query<{ organization_id: string }>(
    `SELECT o.organization_id
     FROM organization o
     JOIN membership m ON m.organization_id = o.organization_id
     WHERE m.account_id = $1
       AND m.status = 'active'
       AND o.onboarding_completed_at IS NULL
       AND o.slug LIKE 'pending-%'
       AND NOT EXISTS (
         SELECT 1 FROM event e WHERE e.organization_id = o.organization_id LIMIT 1
       )
       AND (
         SELECT COUNT(*)::int FROM membership mx
         WHERE mx.organization_id = o.organization_id AND mx.status = 'active'
       ) = 1`,
    [accountId],
  );

  const removed: string[] = [];
  for (const row of pendingOrgs.rows) {
    await client.query(`DELETE FROM organization WHERE organization_id = $1`, [
      row.organization_id,
    ]);
    removed.push(row.organization_id);
  }

  const remaining = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM membership WHERE account_id = $1 AND status = 'active'`,
    [accountId],
  );
  const membershipCount = Number(remaining.rows[0]?.n ?? 0);

  let accountRemoved = false;
  if (membershipCount === 0 && removed.length > 0) {
    const acct = await client.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM account WHERE account_id = $1`,
      [accountId],
    );
    if (!acct.rows[0]?.password_hash) {
      await client.query(`DELETE FROM account WHERE account_id = $1`, [accountId]);
      accountRemoved = true;
    }
  }

  return { removed_org_ids: removed, account_removed: accountRemoved };
}
