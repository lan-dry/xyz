import type pg from "pg";

export type SpanRow = {
  span_id: string;
  organization_id: string;
  trace_id: string;
  parent_span_id: string | null;
  label: string | null;
  status: string;
  started_at: Date;
  ended_at: Date | null;
};

export type SpanWithEvents = SpanRow & {
  events: Array<{
    event_id: string;
    sequence_num: number;
    action_kind: string;
    policy_decision: string;
    tool_name: string | null;
    emitted_at: string;
  }>;
  child_spans: SpanWithEvents[];
};

export async function listSpansByTrace(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<SpanRow[]> {
  const result = await client.query<SpanRow>(
    `SELECT span_id, organization_id, trace_id, parent_span_id, label, status,
            started_at, ended_at
     FROM span
     WHERE organization_id = $1 AND trace_id = $2
     ORDER BY started_at ASC`,
    [organizationId, traceId],
  );
  return result.rows;
}

export function buildSpanTree(
  spans: SpanRow[],
  eventsBySpan: Map<string, SpanWithEvents["events"]>,
): SpanWithEvents[] {
  const nodes = new Map<string, SpanWithEvents>();
  for (const s of spans) {
    nodes.set(s.span_id, {
      ...s,
      events: eventsBySpan.get(s.span_id) ?? [],
      child_spans: [],
    });
  }
  const roots: SpanWithEvents[] = [];
  for (const node of nodes.values()) {
    if (node.parent_span_id && nodes.has(node.parent_span_id)) {
      nodes.get(node.parent_span_id)!.child_spans.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
