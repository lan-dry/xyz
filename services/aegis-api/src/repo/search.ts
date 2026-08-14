import type pg from "pg";

export type SearchHit = {
  event_id: string;
  trace_id: string;
  agent_id: string;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  emitted_at: Date;
  rank: number;
};

function escapeTsQueryTerm(term: string): string {
  return term.replace(/['\\]/g, "\\$&").trim();
}

function buildTsQuery(query: string): string | null {
  const terms = query
    .trim()
    .split(/\s+/)
    .map(escapeTsQueryTerm)
    .filter(Boolean);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

export async function searchOrganizationEvents(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  query: string,
  limit: number,
  offset: number,
): Promise<{ hits: SearchHit[]; total: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { hits: [], total: 0 };
  }

  const tsQuery = buildTsQuery(trimmed);

  if (tsQuery) {
    try {
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM event
         WHERE organization_id = $1
           AND search_vector @@ to_tsquery('simple', $2)`,
        [organizationId, tsQuery],
      );
      const total = Number(countResult.rows[0]?.count ?? 0);
      if (total > 0) {
        const result = await client.query<SearchHit>(
          `SELECT event_id, trace_id, agent_id, action_kind, policy_decision, tool_name,
                  emitted_at,
                  ts_rank(search_vector, to_tsquery('simple', $2)) AS rank
           FROM event
           WHERE organization_id = $1
             AND search_vector @@ to_tsquery('simple', $2)
           ORDER BY rank DESC, emitted_at DESC
           LIMIT $3 OFFSET $4`,
          [organizationId, tsQuery, limit, offset],
        );
        return { hits: result.rows, total };
      }
    } catch {
      // fall through to ILIKE
    }
  }

  const pattern = `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM event
     WHERE organization_id = $1
       AND (
         event_id ILIKE $2 ESCAPE '\\' OR trace_id ILIKE $2 ESCAPE '\\'
         OR agent_id ILIKE $2 ESCAPE '\\'
         OR tool_name ILIKE $2 ESCAPE '\\' OR payload::text ILIKE $2 ESCAPE '\\'
       )`,
    [organizationId, pattern],
  );
  const total = Number(countResult.rows[0]?.count ?? 0);
  const result = await client.query<SearchHit>(
    `SELECT event_id, trace_id, agent_id, action_kind, policy_decision, tool_name,
            emitted_at, 0::float AS rank
     FROM event
     WHERE organization_id = $1
       AND (
         event_id ILIKE $2 ESCAPE '\\' OR trace_id ILIKE $2 ESCAPE '\\'
         OR agent_id ILIKE $2 ESCAPE '\\'
         OR tool_name ILIKE $2 ESCAPE '\\' OR payload::text ILIKE $2 ESCAPE '\\'
       )
     ORDER BY emitted_at DESC
     LIMIT $3 OFFSET $4`,
    [organizationId, pattern, limit, offset],
  );
  return { hits: result.rows, total };
}
