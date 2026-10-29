import type pg from "pg";

export type OverviewMetrics = {
  environment: "production" | "sandbox" | "all";
  agent_count: number;
  active_policy_count: number;
  workflow_count: number;
  pending_approvals: number;
  /** Share of agents covered by an active policy in this env (0–100). */
  policy_coverage_pct: number;
  /** Events with chain_valid = false in this env scope. Healthy demo → 0. */
  unverified_event_count: number;
  events_24h: number;
  traces_24h: number;
  /** Claude §13.3 value report — last 30 days. */
  value_report_30d: {
    actions: number;
    allowed: number;
    approvals_requested: number;
    stopped: number;
    /** Sum of amount_usd on denied/stopped tool events. Label: amount stopped. */
    amount_stopped_usd: number;
    avg_approval_seconds: number | null;
  };
};

export async function getOverviewMetrics(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox" = "production",
): Promise<OverviewMetrics> {
  const agents = await client.query<{ count: string; with_policy: string }>(
    `SELECT
       COUNT(*)::text AS count,
       COUNT(*) FILTER (
         WHERE default_policy_id IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM policy p
              WHERE p.organization_id = agent.organization_id
                AND p.status = 'active'
                AND COALESCE(p.environment, 'production') =
                    COALESCE(agent.environment, 'production')
            )
       )::text AS with_policy
     FROM agent
     WHERE organization_id = $1
       AND COALESCE(environment, 'production') = $2`,
    [organizationId, environment],
  );

  const agentCount = Number(agents.rows[0]?.count ?? 0);
  const withPolicy = Number(agents.rows[0]?.with_policy ?? 0);
  const policyCoveragePct =
    agentCount === 0 ? 100 : Math.round((withPolicy / agentCount) * 100);

  const policies = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM policy
     WHERE organization_id = $1 AND status = 'active'
       AND COALESCE(environment, 'production') = $2`,
    [organizationId, environment],
  );

  let workflowCount = 0;
  try {
    const workflows = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM governed_workflow
       WHERE organization_id = $1 AND environment = $2`,
      [organizationId, environment],
    );
    workflowCount = Number(workflows.rows[0]?.count ?? 0);
  } catch {
    workflowCount = 0;
  }

  const pending = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM approval
     WHERE organization_id = $1 AND status = 'pending'`,
    [organizationId],
  );

  const unverified = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM event e
     WHERE e.organization_id = $1
       AND e.chain_valid = false
       AND COALESCE(
         (SELECT a.environment FROM agent a
          WHERE a.agent_id = e.agent_id AND a.organization_id = e.organization_id),
         'production'
       ) = $2`,
    [organizationId, environment],
  );

  const recent = await client.query<{ events: string; traces: string }>(
    `SELECT
       COUNT(*)::text AS events,
       COUNT(DISTINCT trace_id)::text AS traces
     FROM event e
     WHERE e.organization_id = $1
       AND e.emitted_at >= now() - interval '24 hours'
       AND COALESCE(
         (SELECT a.environment FROM agent a
          WHERE a.agent_id = e.agent_id AND a.organization_id = e.organization_id),
         'production'
       ) = $2`,
    [organizationId, environment],
  );

  const value = await client.query<{
    actions: string;
    allowed: string;
    stopped: string;
    amount_stopped: string;
  }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE e.action_kind IN ('tool_call', 'policy_decision', 'human_approval')
       )::text AS actions,
       COUNT(*) FILTER (
         WHERE e.policy_decision = 'allow'
       )::text AS allowed,
       COUNT(*) FILTER (
         WHERE e.policy_decision = 'deny'
       )::text AS stopped,
       COALESCE(SUM(
         CASE
           WHEN e.policy_decision = 'deny'
             AND (e.payload->>'amount_usd') ~ '^-?[0-9]+(\\.[0-9]+)?$'
             THEN (e.payload->>'amount_usd')::numeric
           WHEN e.policy_decision = 'deny'
             AND (e.payload->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
             THEN (e.payload->>'amount')::numeric
           ELSE 0
         END
       ), 0)::text AS amount_stopped
     FROM event e
     WHERE e.organization_id = $1
       AND e.emitted_at >= now() - interval '30 days'
       AND COALESCE(
         (SELECT a.environment FROM agent a
          WHERE a.agent_id = e.agent_id AND a.organization_id = e.organization_id),
         'production'
       ) = $2`,
    [organizationId, environment],
  );

  const approvals30 = await client.query<{
    requested: string;
    avg_seconds: string | null;
  }>(
    `SELECT
       COUNT(*)::text AS requested,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (decided_at - created_at))
       ) FILTER (WHERE decided_at IS NOT NULL))::text AS avg_seconds
     FROM approval
     WHERE organization_id = $1
       AND created_at >= now() - interval '30 days'`,
    [organizationId],
  );

  const avgRaw = approvals30.rows[0]?.avg_seconds;
  const avgSeconds =
    avgRaw != null && avgRaw !== "" && Number.isFinite(Number(avgRaw))
      ? Number(avgRaw)
      : null;

  return {
    environment,
    agent_count: agentCount,
    active_policy_count: Number(policies.rows[0]?.count ?? 0),
    workflow_count: workflowCount,
    pending_approvals: Number(pending.rows[0]?.count ?? 0),
    policy_coverage_pct: policyCoveragePct,
    unverified_event_count: Number(unverified.rows[0]?.count ?? 0),
    events_24h: Number(recent.rows[0]?.events ?? 0),
    traces_24h: Number(recent.rows[0]?.traces ?? 0),
    value_report_30d: {
      actions: Number(value.rows[0]?.actions ?? 0),
      allowed: Number(value.rows[0]?.allowed ?? 0),
      approvals_requested: Number(approvals30.rows[0]?.requested ?? 0),
      stopped: Number(value.rows[0]?.stopped ?? 0),
      amount_stopped_usd: Number(value.rows[0]?.amount_stopped ?? 0),
      avg_approval_seconds: avgSeconds,
    },
  };
}
