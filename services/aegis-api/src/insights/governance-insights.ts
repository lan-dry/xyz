import type pg from "pg";

import {
  buildGovernanceInsights,
  type GovernanceEventInput,
  type GovernanceInsightsResult,
} from "@salanor/aegis";

export type OrgGovernanceInsights = GovernanceInsightsResult & {
  period_days: number;
  trace_count: number;
  event_count: number;
};

export async function getOrgGovernanceInsights(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  periodDays = 30,
): Promise<OrgGovernanceInsights> {
  const events = await client.query<{
    action_kind: string;
    policy_decision: string;
    tool_name: string | null;
    payload: unknown;
    trace_id: string;
  }>(
    `SELECT action_kind, policy_decision, tool_name, payload, trace_id
     FROM event
     WHERE organization_id = $1
       AND emitted_at >= now() - ($2::text || ' days')::interval
     ORDER BY emitted_at DESC
     LIMIT 2000`,
    [organizationId, String(periodDays)],
  );

  const traceIds = new Set(events.rows.map((r) => r.trace_id));
  const input: GovernanceEventInput[] = events.rows.map((r) => ({
    action_kind: r.action_kind,
    policy_decision: r.policy_decision,
    tool_name: r.tool_name,
    payload: r.payload,
  }));

  const base = buildGovernanceInsights(input);

  return {
    ...base,
    period_days: periodDays,
    trace_count: traceIds.size,
    event_count: events.rows.length,
  };
}
