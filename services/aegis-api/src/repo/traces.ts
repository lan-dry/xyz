import type pg from "pg";

export type TraceSummary = {
  trace_id: string;
  organization_id: string;
  agent_id: string;
  status: string;
  started_at: Date;
  ended_at: Date | null;
  total_events: number;
  denied_events: number;
  root_event_id: string | null;
  root_event_hash: string | null;
};

export type TraceListFilters = {
  q?: string;
  agentId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

const TRACE_SELECT = `
  SELECT t.trace_id,
         t.organization_id,
         t.agent_id,
         t.status,
         t.started_at,
         t.ended_at,
         t.root_event_id,
         re.event_hash AS root_event_hash,
         COALESCE(
           (SELECT COUNT(*)::int FROM event e
            WHERE e.trace_id = t.trace_id AND e.organization_id = t.organization_id),
           0
         ) AS total_events,
         t.denied_events
  FROM trace t
  LEFT JOIN event re
    ON re.event_id = t.root_event_id
   AND re.organization_id = t.organization_id
`;

function traceWhereClause(
  organizationId: string,
  filters: TraceListFilters,
  paramStart: number,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [organizationId];
  let n = paramStart;
  const parts = [`t.organization_id = $1`];

  if (filters.q?.trim()) {
    n += 1;
    const pattern = `%${filters.q.trim()}%`;
    params.push(pattern);
    parts.push(
      `(t.trace_id ILIKE $${n} OR t.agent_id ILIKE $${n} OR EXISTS (
         SELECT 1 FROM event ev
         WHERE ev.trace_id = t.trace_id
           AND ev.organization_id = t.organization_id
           AND ev.tool_name ILIKE $${n}
       ))`,
    );
  }

  if (filters.agentId?.trim()) {
    n += 1;
    params.push(filters.agentId.trim());
    parts.push(`t.agent_id = $${n}`);
  }

  if (filters.status?.trim()) {
    n += 1;
    params.push(filters.status.trim());
    parts.push(`t.status = $${n}`);
  }

  if (filters.from) {
    n += 1;
    params.push(filters.from);
    parts.push(`t.started_at >= $${n}`);
  }

  if (filters.to) {
    n += 1;
    params.push(filters.to);
    parts.push(`t.started_at <= $${n}`);
  }

  return { sql: parts.join(" AND "), params };
}

export async function listTracesByOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  filters: TraceListFilters = {},
): Promise<TraceSummary[]> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const { sql: whereSql, params } = traceWhereClause(organizationId, filters, 1);

  const result = await client.query<TraceSummary>(
    `${TRACE_SELECT}
     WHERE ${whereSql}
     ORDER BY t.started_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return result.rows;
}

export async function countTracesByOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  filters: TraceListFilters = {},
): Promise<number> {
  const { sql: whereSql, params } = traceWhereClause(organizationId, filters, 1);
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM trace t
     WHERE ${whereSql}`,
    params,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getTraceById(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<TraceSummary | null> {
  const result = await client.query<TraceSummary>(
    `${TRACE_SELECT}
     WHERE t.organization_id = $1 AND t.trace_id = $2`,
    [organizationId, traceId],
  );
  return result.rows[0] ?? null;
}
