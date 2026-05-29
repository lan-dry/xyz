import type pg from "pg";

export type AuditLogRow = {
  audit_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  actor_email: string | null;
};

export type AuditLogFilters = {
  action?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditLogs(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  filters: AuditLogFilters = {},
): Promise<{ logs: AuditLogRow[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const params: unknown[] = [organizationId];
  const parts = ["a.organization_id = $1"];

  if (filters.action?.trim()) {
    params.push(filters.action.trim());
    parts.push(`a.action = $${params.length}`);
  }

  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const n = params.length;
    parts.push(
      `(a.action ILIKE $${n} OR a.resource_type ILIKE $${n} OR a.resource_id ILIKE $${n} OR a.metadata::text ILIKE $${n})`,
    );
  }

  const whereSql = parts.join(" AND ");

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_log a WHERE ${whereSql}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const listParams = [...params, limit, offset];
  const result = await client.query<AuditLogRow>(
    `SELECT a.audit_id,
            a.action,
            a.resource_type,
            a.resource_id,
            a.metadata,
            a.created_at,
            COALESCE(
              ac.email,
              a.metadata->>'actor_email'
            ) AS actor_email
     FROM audit_log a
     LEFT JOIN membership m ON m.membership_id = a.user_id
     LEFT JOIN account ac ON ac.account_id = m.account_id
     WHERE ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return { logs: result.rows, total };
}

export async function listDistinctAuditActions(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string[]> {
  const result = await client.query<{ action: string }>(
    `SELECT DISTINCT action FROM audit_log
     WHERE organization_id = $1
     ORDER BY action ASC
     LIMIT 50`,
    [organizationId],
  );
  return result.rows.map((r) => r.action);
}
