import type pg from "pg";
import { evaluateToolPolicy } from "../policy/evaluate.js";

export type SimulateExample = {
  event_id: string;
  trace_id: string;
  tool_name: string | null;
  emitted_at: string;
  historical_decision: string;
  today_decision: string;
  changed: boolean;
  reason: string | null;
};

export type SimulateReport = {
  days: number;
  scanned: number;
  same: number;
  would_allow: number;
  would_ask: number;
  would_stop: number;
  flipped: number;
  examples: SimulateExample[];
};

/** Re-evaluate historical tool_call / policy_decision events with today's policies. */
export async function simulatePolicyOnHistory(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  days: 30 | 90 = 90,
  limit = 500,
): Promise<SimulateReport> {
  const events = await client.query<{
    event_id: string;
    trace_id: string;
    agent_id: string;
    tool_name: string | null;
    policy_decision: string;
    payload: unknown;
    emitted_at: Date;
  }>(
    `SELECT event_id, trace_id, agent_id, tool_name, policy_decision, payload, emitted_at
     FROM event
     WHERE organization_id = $1
       AND emitted_at >= now() - ($2::text || ' days')::interval
       AND tool_name IS NOT NULL
       AND action_kind IN ('tool_call', 'policy_decision')
     ORDER BY emitted_at DESC
     LIMIT $3`,
    [organizationId, String(days), limit],
  );

  let same = 0;
  let would_allow = 0;
  let would_ask = 0;
  let would_stop = 0;
  let flipped = 0;
  const examples: SimulateExample[] = [];

  for (const row of events.rows) {
    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {};
    const today = await evaluateToolPolicy(client, {
      organizationId,
      agentId: row.agent_id,
      toolName: row.tool_name!,
      payload,
    });

    const historical = row.policy_decision;
    const changed = historical !== today.decision;
    if (!changed) same += 1;
    else flipped += 1;

    if (today.decision === "allow") would_allow += 1;
    else if (today.decision === "allow_with_obligation") would_ask += 1;
    else would_stop += 1;

    if (changed && examples.length < 12) {
      examples.push({
        event_id: row.event_id,
        trace_id: row.trace_id,
        tool_name: row.tool_name,
        emitted_at: row.emitted_at.toISOString(),
        historical_decision: historical,
        today_decision: today.decision,
        changed: true,
        reason: today.reason,
      });
    }
  }

  return {
    days,
    scanned: events.rows.length,
    same,
    would_allow,
    would_ask,
    would_stop,
    flipped,
    examples,
  };
}
