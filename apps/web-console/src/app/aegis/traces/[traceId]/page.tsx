"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  BackLink,
  ConsolePage,
  EmptyState,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { ChainRootPanel } from "@/components/console/chain-root-panel";
import { GovernanceInsightsPanel } from "@/components/console/governance-insights-panel";
import { ProvenanceClaimPanel } from "@/components/console/provenance-claim-panel";
import { SpanTreePanel } from "@/components/console/span-tree-panel";
import { consoleApi } from "@/lib/api";
import { buildGovernanceInsights } from "@/lib/governance-insights";
import type { EventDetail, EventSpanGroup, SpanTreeNode, TraceSummary } from "@/lib/types";

export default function TraceDetailPage() {
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["console", "trace", traceId],
    queryFn: () =>
      consoleApi<{
        trace: TraceSummary;
        events: EventDetail[];
        spans: EventSpanGroup[];
        span_tree: SpanTreeNode[];
      }>(`/traces/${encodeURIComponent(traceId)}`),
  });

  const traceInsights = data
    ? buildGovernanceInsights(
        data.events.map((e) => ({
          action_kind: e.action_kind,
          policy_decision: e.policy_decision,
          tool_name: e.tool_name,
          payload: e.payload,
        })),
      )
    : null;

  const highlightEvent = data
    ? (data.events.find((e) => e.policy_decision === "deny") ??
        data.events.find((e) => e.provenance_claim) ??
        data.events[data.events.length - 1])
    : null;

  const spanEventIds = new Set<string>();
  if (data?.span_tree?.length) {
    function collectIds(nodes: SpanTreeNode[]) {
      for (const n of nodes) {
        for (const e of n.events) spanEventIds.add(e.event_id);
        collectIds(n.child_spans);
      }
    }
    collectIds(data.span_tree);
  }
  const orphanEvents =
    data?.events.filter((e) => !e.span_id || !spanEventIds.has(e.event_id)) ?? [];
  const hasTimeline =
    Boolean(data?.span_tree?.length) || orphanEvents.length > 0;

  return (
    <ConsolePage>
      <BackLink href="/aegis/traces">← Traces</BackLink>
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Trace not found or failed to load." /> : null}
      {data ? (
        <>
          <PageHeader
            title={data.trace.trace_id}
            subtitle={
              <>
                Agent <code>{data.trace.agent_id}</code> ·{" "}
                <StatusBadge status={data.trace.status} /> · {data.trace.total_events}{" "}
                event(s) · started {new Date(data.trace.started_at).toLocaleString()}
              </>
            }
            actions={
              <Link
                href={`/aegis/traces/${encodeURIComponent(traceId)}/replay`}
                className={`${ui.btn} ${ui.btnPrimary}`}
              >
                Replay
              </Link>
            }
          />
          {data.trace.chain_root_hash ? (
            <ChainRootPanel
              chainRootHash={data.trace.chain_root_hash}
              rootEventId={data.trace.root_event_id}
              rootEventHash={data.trace.root_event_hash}
            />
          ) : null}
          {highlightEvent?.provenance_claim ? (
            <ProvenanceClaimPanel
              claim={highlightEvent.provenance_claim}
              authority={highlightEvent.provenance_authority}
            />
          ) : null}
          {traceInsights ? (
            <GovernanceInsightsPanel
              headline={traceInsights.headline}
              insights={traceInsights.insights}
            />
          ) : null}
          {hasTimeline ? (
            <SpanTreePanel tree={data.span_tree ?? []} orphanEvents={orphanEvents} />
          ) : data.events.length === 0 ? (
            <div className={ui.tableWrap}>
              <EmptyState title="No events in this trace" />
            </div>
          ) : null}
          {data.events.length > 0 ? (
            <details style={{ marginTop: "0.5rem" }}>
              <summary
                className={ui.panelTitle}
                style={{ cursor: "pointer", fontSize: "0.9375rem", marginBottom: "0.75rem" }}
              >
                All events (flat list, {data.events.length})
              </summary>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Event</th>
                      <th>Kind</th>
                      <th>Policy</th>
                      <th>Tool</th>
                      <th>Chain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e.event_id}>
                        <td>{e.sequence_num}</td>
                        <td>
                          <Link
                            href={`/aegis/events/${encodeURIComponent(e.event_id)}`}
                            className={`${ui.tableLink} mono`}
                          >
                            {e.event_id}
                          </Link>
                        </td>
                        <td>{e.action_kind}</td>
                        <td>
                          <StatusBadge status={e.policy_decision} />
                        </td>
                        <td className="mono">{e.tool_name ?? "—"}</td>
                        <td>
                          {e.chain_valid ? (
                            <StatusBadge status="ok" />
                          ) : (
                            <StatusBadge status="failed" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </ConsolePage>
  );
}
