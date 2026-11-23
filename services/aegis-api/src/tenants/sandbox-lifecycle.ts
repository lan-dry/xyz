/**
 * Sandbox expiry: warn → read-only → archive.
 */
import type pg from "pg";

export type SandboxLifecycleAction =
  | "email_7d"
  | "email_2d"
  | "email_expired"
  | "set_read_only"
  | "archive";

export async function listSandboxLifecycleDue(
  db: pg.Pool | pg.PoolClient,
  now = new Date(),
): Promise<
  Array<{
    organization_id: string;
    slug: string;
    action: SandboxLifecycleAction;
    sandbox_expires_at: Date;
  }>
> {
  const r = await db.query<{
    organization_id: string;
    slug: string;
    sandbox_expires_at: Date;
    sandbox_read_only_until: Date | null;
    sandbox_archived_at: Date | null;
  }>(
    `SELECT organization_id, slug, sandbox_expires_at, sandbox_read_only_until, sandbox_archived_at
       FROM organization
      WHERE tenant_kind = 'sandbox'
        AND sandbox_archived_at IS NULL
        AND sandbox_expires_at IS NOT NULL`,
  );
  const out: Array<{
    organization_id: string;
    slug: string;
    action: SandboxLifecycleAction;
    sandbox_expires_at: Date;
  }> = [];
  for (const row of r.rows) {
    const exp = new Date(row.sandbox_expires_at).getTime();
    const t = now.getTime();
    const days = (exp - t) / (24 * 3600_000);
    if (row.sandbox_archived_at) continue;
    if (t > exp + 7 * 24 * 3600_000) {
      out.push({ ...row, action: "archive", sandbox_expires_at: row.sandbox_expires_at });
    } else if (t >= exp && !row.sandbox_read_only_until) {
      out.push({ ...row, action: "set_read_only", sandbox_expires_at: row.sandbox_expires_at });
      out.push({ ...row, action: "email_expired", sandbox_expires_at: row.sandbox_expires_at });
    } else if (days <= 2 && days > 0) {
      out.push({ ...row, action: "email_2d", sandbox_expires_at: row.sandbox_expires_at });
    } else if (days <= 7 && days > 2) {
      out.push({ ...row, action: "email_7d", sandbox_expires_at: row.sandbox_expires_at });
    }
  }
  return out;
}

export async function applySandboxReadOnly(
  db: pg.Pool | pg.PoolClient,
  organizationId: string,
  now = new Date(),
): Promise<void> {
  const until = new Date(now.getTime() + 7 * 24 * 3600_000);
  await db.query(
    `UPDATE organization
        SET sandbox_read_only_until = $2
      WHERE organization_id = $1 AND tenant_kind = 'sandbox'`,
    [organizationId, until.toISOString()],
  );
}

export async function archiveSandbox(
  db: pg.Pool | pg.PoolClient,
  organizationId: string,
  now = new Date(),
): Promise<void> {
  await db.query(
    `UPDATE organization
        SET sandbox_archived_at = $2
      WHERE organization_id = $1 AND tenant_kind = 'sandbox'`,
    [organizationId, now.toISOString()],
  );
}
