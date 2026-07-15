import type pg from "pg";

export type EventRow = {
  event_id: string;
  organization_id: string;
  trace_id: string;
  agent_id: string;
  emitted_at: Date;
};

export type EventDetail = {
  event_id: string;
  organization_id: string;
  trace_id: string;
  span_id: string | null;
  agent_id: string;
  actor_type: string;
  actor_principal: string;
  policy_id: string | null;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  sequence_num: number;
  event_hash: string;
  prev_event_hash: string | null;
  chain_valid: boolean;
  emitted_at: Date;
  ingested_at: Date;
  payload: unknown;
};

/**
 * Org-scoped read: every query MUST filter by organization_id (ADR-0002).
 */
export async function listEventsByOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<EventRow[]> {
  const result = await client.query<EventRow>(
    `SELECT event_id, organization_id, trace_id, agent_id, emitted_at
     FROM event
     WHERE organization_id = $1
     ORDER BY emitted_at DESC`,
    [organizationId],
  );
  return result.rows;
}

export async function listEventsByTrace(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<EventDetail[]> {
  const result = await client.query<EventDetail>(
    `SELECT event_id, organization_id, trace_id, span_id, agent_id, actor_type, actor_principal,
            policy_id, action_kind, policy_decision, tool_name, sequence_num, event_hash,
            prev_event_hash, chain_valid, emitted_at, ingested_at, payload
     FROM event
     WHERE organization_id = $1 AND trace_id = $2
     ORDER BY sequence_num ASC`,
    [organizationId, traceId],
  );
  return result.rows;
}

export async function getEventById(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  eventId: string,
): Promise<EventDetail | null> {
  const result = await client.query<EventDetail>(
    `SELECT event_id, organization_id, trace_id, span_id, agent_id, actor_type, actor_principal,
            policy_id, action_kind, policy_decision, tool_name, sequence_num, event_hash,
            prev_event_hash, chain_valid, emitted_at, ingested_at, payload
     FROM event
     WHERE organization_id = $1 AND event_id = $2`,
    [organizationId, eventId],
  );
  return result.rows[0] ?? null;
}

export async function countEventsByOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM event WHERE organization_id = $1`,
    [organizationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
