import type pg from "pg";

export type TraceSummary = {
  trace_id: string;
  organization_id: string;
  agent_id: string;
  /** display_name, else slug, else agent_id */
  agent_name: string;
  status: string;
  started_at: Date;
  ended_at: Date | null;
  total_events: number;
  denied_events: number;
  root_event_id: string | null;
  root_event_hash: string | null;
  pending_approval: boolean;
  has_policy_decision: boolean;
  needs_person: boolean;
  preview_fields: string[] | null;
  preview_anomaly_reason: string | null;
  preview_anomaly_type: string | null;
  preview_subject: string | null;
};

export type TraceListFilters = {
  q?: string;
  agentId?: string;
  status?: string;
  environment?: "production" | "sandbox";
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

const TRACE_SELECT = `
  SELECT t.trace_id,
         t.organization_id,
         t.agent_id,
         COALESCE(
           NULLIF(ag.display_name, ''),
           NULLIF(ag.slug, ''),
           t.agent_id
         ) AS agent_name,
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
         COALESCE(
           (SELECT COUNT(*)::int FROM event e
            WHERE e.trace_id = t.trace_id
              AND e.organization_id = t.organization_id
              AND e.action_kind = 'policy_decision'
              AND e.policy_decision = 'deny'),
           0
         ) AS denied_events,
         EXISTS (
           SELECT 1 FROM approval a
           JOIN event ev ON ev.event_id = a.event_id AND ev.organization_id = a.organization_id
           WHERE ev.trace_id = t.trace_id
             AND a.organization_id = t.organization_id
             AND a.status = 'pending'
             AND (a.expires_at IS NULL OR a.expires_at > now())
         ) AS pending_approval,
         EXISTS (
           SELECT 1 FROM event e
           WHERE e.trace_id = t.trace_id
             AND e.organization_id = t.organization_id
             AND e.action_kind = 'policy_decision'
         ) AS has_policy_decision,
         (
           EXISTS (
             SELECT 1 FROM event e
             WHERE e.trace_id = t.trace_id
               AND e.organization_id = t.organization_id
               AND e.policy_decision = 'allow_with_obligation'
           )
           AND NOT EXISTS (
             SELECT 1 FROM event e
             WHERE e.trace_id = t.trace_id
               AND e.organization_id = t.organization_id
               AND e.action_kind = 'human_approval'
           )
         ) AS needs_person,
         (
           SELECT e.payload->>'reason'
           FROM event e
           WHERE e.trace_id = t.trace_id
             AND e.organization_id = t.organization_id
             AND e.action_kind = 'anomaly_signal'
           ORDER BY e.sequence_num DESC
           LIMIT 1
         ) AS preview_anomaly_reason,
         (
           SELECT e.payload->>'type'
           FROM event e
           WHERE e.trace_id = t.trace_id
             AND e.organization_id = t.organization_id
             AND e.action_kind = 'anomaly_signal'
           ORDER BY e.sequence_num DESC
           LIMIT 1
         ) AS preview_anomaly_type,
         (
           SELECT COALESCE(
             (
               SELECT NULLIF(e.payload->>'task', '')
               FROM event e
               WHERE e.trace_id = t.trace_id
                 AND e.organization_id = t.organization_id
                 AND NULLIF(e.payload->>'task', '') IS NOT NULL
               ORDER BY e.sequence_num ASC
               LIMIT 1
             ),
             (
               SELECT COALESCE(
                 NULLIF(e.payload->>'subject', ''),
                 NULLIF(e.payload->>'business_context', ''),
                 NULLIF(e.payload->>'trigger_detail', '')
               )
               FROM event e
               WHERE e.trace_id = t.trace_id
                 AND e.organization_id = t.organization_id
                 AND COALESCE(
                   NULLIF(e.payload->>'subject', ''),
                   NULLIF(e.payload->>'business_context', ''),
                   NULLIF(e.payload->>'trigger_detail', '')
                 ) IS NOT NULL
               ORDER BY e.sequence_num ASC
               LIMIT 1
             ),
             (
               SELECT NULLIF(e.payload->>'email_subject', '')
               FROM event e
               WHERE e.trace_id = t.trace_id
                 AND e.organization_id = t.organization_id
                 AND NULLIF(e.payload->>'email_subject', '') IS NOT NULL
                 AND (
                   lower(COALESCE(e.payload->>'source', '')) LIKE '%email%'
                   OR NULLIF(e.payload->>'email_from', '') IS NOT NULL
                   OR NULLIF(e.payload->>'email_to', '') IS NOT NULL
                   OR NULLIF(e.payload->>'mailbox', '') IS NOT NULL
                 )
               ORDER BY e.sequence_num ASC
               LIMIT 1
             )
           )
         ) AS preview_subject,
         (
           SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
           FROM event e
           CROSS JOIN LATERAL (
             SELECT jsonb_array_elements_text(arr) AS x
             FROM (
               SELECT CASE
                 WHEN jsonb_typeof(e.payload->'fields_accessed') = 'array'
                   THEN e.payload->'fields_accessed' ELSE '[]'::jsonb END AS arr
               UNION ALL
               SELECT CASE
                 WHEN jsonb_typeof(e.payload->'data_touched') = 'array'
                   THEN e.payload->'data_touched' ELSE '[]'::jsonb END
               UNION ALL
               SELECT CASE
                 WHEN jsonb_typeof(e.payload->'fields') = 'array'
                   THEN e.payload->'fields' ELSE '[]'::jsonb END
               UNION ALL
               SELECT CASE
                 WHEN jsonb_typeof(e.payload->'evaluation_context'->'fields_accessed') = 'array'
                   THEN e.payload->'evaluation_context'->'fields_accessed' ELSE '[]'::jsonb END
             ) src
           ) elems
           WHERE e.trace_id = t.trace_id
             AND e.organization_id = t.organization_id
             AND x IS NOT NULL
             AND btrim(x) <> ''
         ) AS preview_fields
  FROM trace t
  LEFT JOIN agent ag
    ON ag.agent_id = t.agent_id
   AND ag.organization_id = t.organization_id
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
      `(t.trace_id ILIKE $${n} OR t.agent_id ILIKE $${n}
        OR EXISTS (
          SELECT 1 FROM agent a
          WHERE a.agent_id = t.agent_id
            AND a.organization_id = t.organization_id
            AND (a.display_name ILIKE $${n} OR a.slug ILIKE $${n})
        )
        OR EXISTS (
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

  if (filters.environment === "production" || filters.environment === "sandbox") {
    n += 1;
    params.push(filters.environment);
    // Missing agent.environment (pre-migrate) or unknown agent → treat as production.
    parts.push(`COALESCE(
      (SELECT a.environment FROM agent a
       WHERE a.agent_id = t.agent_id AND a.organization_id = t.organization_id),
      'production'
    ) = $${n}`);
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
