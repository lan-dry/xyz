import type { ExportEventRow } from "./build-bundle.js";
import type { ExportContext } from "./gather-context.js";

export type EventPeriodStats = {
  total: number;
  allow: number;
  deny: number;
  obligation: number;
  unique_agents: number;
  unique_traces: number;
};

export function computeEventPeriodStats(
  events: ExportEventRow[],
): EventPeriodStats {
  const agents = new Set<string>();
  const traces = new Set<string>();
  let allow = 0;
  let deny = 0;
  let obligation = 0;

  for (const event of events) {
    agents.add(event.agent_id);
    traces.add(event.trace_id);
    if (event.policy_decision === "deny") {
      deny += 1;
    } else if (event.policy_decision === "allow_with_obligation") {
      obligation += 1;
    } else {
      allow += 1;
    }
  }

  return {
    total: events.length,
    allow,
    deny,
    obligation,
    unique_agents: agents.size,
    unique_traces: traces.size,
  };
}

export function computeApprovalStats(context: ExportContext): {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
} {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const row of context.approvals as Array<{ status?: string }>) {
    if (row.status === "pending") pending += 1;
    else if (row.status === "approved") approved += 1;
    else if (row.status === "rejected") rejected += 1;
  }
  return { pending, approved, rejected, total: context.approvals.length };
}

export function countActivePolicies(context: ExportContext): number {
  return (context.policies as Array<{ status?: string }>).filter(
    (p) => p.status === "active",
  ).length;
}
