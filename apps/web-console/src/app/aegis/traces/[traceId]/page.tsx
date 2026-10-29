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
  OutcomeChip,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { CaseFourAnswersPanel } from "@/components/console/case-four-answers";
import { ChainRootPanel } from "@/components/console/chain-root-panel";
import { SpanTreePanel } from "@/components/console/span-tree-panel";
import { consoleApi } from "@/lib/api";
import { idApi } from "@/lib/id-api";
import { buildCaseStory } from "@/lib/case-story";
import type {
  EventDetail,
  EventSpanGroup,
  MeResponse,
  SpanTreeNode,
  TraceSummary,
} from "@/lib/types";

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

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  const story = data
    ? buildCaseStory(data.events, {
        traceId: data.trace.trace_id,
        agentId: data.trace.agent_id,
        status: data.trace.status,
        pendingApproval: data.trace.pending_approval,
        deniedEvents: data.trace.denied_events,
        startedAt: data.trace.started_at,
      })
    : null;

  const firstEventId = data?.events[0]?.event_id;
  const orgSlug = meQuery.data?.organization?.slug;

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
      <BackLink href="/aegis/traces">Cases</BackLink>
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Case not found or failed to load." /> : null}
      {data && story ? (
        <>
          <PageHeader
            title={story.headline}
            subtitle={
              <>
                <OutcomeChip chip={story.outcome.chip} kind={story.outcome.kind} />
                <span style={{ marginLeft: "0.65rem" }}>
                  {new Date(data.trace.started_at).toLocaleString()}
                  <span
                    style={{ color: "var(--console-fg-subtle)", marginLeft: "0.35rem" }}
                    title="UTC"
                  >
                    ({new Date(data.trace.started_at).toISOString()})
                  </span>
                </span>
              </>
            }
            actions={
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Link
                  href={`/aegis/traces/${encodeURIComponent(traceId)}/replay`}
                  className={`${ui.btn} ${ui.btnPrimary}`}
                >
                  Watch what happened
                </Link>
                {firstEventId && orgSlug ? (
                  <Link
                    href={`/verify?org=${encodeURIComponent(orgSlug)}&event=${encodeURIComponent(firstEventId)}`}
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Verify seal
                  </Link>
                ) : firstEventId ? (
                  <Link
                    href={`/aegis/events/${encodeURIComponent(firstEventId)}`}
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Verify seal
                  </Link>
                ) : null}
              </div>
            }
          />

          <div
            className={`${ui.alert} ${ui.alertSuccess}`}
            style={{ marginBottom: "1.25rem" }}
          >
            <strong>Seal:</strong> every step in this case is append-only. Use{" "}
            <em>Verify seal</em> or open a step → Verify now. Changing a field after signing
            fails verification.
          </div>

          <CaseFourAnswersPanel answers={story.fourAnswers} />

          {story.dataTouched.length > 0 ? (
            <section
              className={`${ui.card} ${ui.cardPad}`}
              style={{ marginBottom: "1.5rem" }}
            >
              <h2 className={ui.panelTitle}>Data the AI looked at</h2>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
                {story.dataTouched.length} kind(s) of customer data:{" "}
                {story.dataTouched.join(", ")}.
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--console-fg-muted)",
                }}
              >
                This record shows what the AI saw, so you can answer “what data was used?”
                if a customer or regulator asks.
              </p>
            </section>
          ) : null}

          {hasTimeline ? (
            <SpanTreePanel tree={data.span_tree ?? []} orphanEvents={orphanEvents} />
          ) : data.events.length === 0 ? (
            <div className={ui.tableWrap}>
              <EmptyState title="No steps in this case" />
            </div>
          ) : null}

          <details style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
            <summary
              className={ui.panelTitle}
              style={{ cursor: "pointer", fontSize: "0.9375rem", marginBottom: "0.75rem" }}
            >
              Technical details (for auditors and engineers)
            </summary>
            <p
              style={{
                margin: "0 0 1rem",
                fontSize: "0.8125rem",
                color: "var(--console-fg-muted)",
              }}
            >
              This is the raw record. Every other screen is generated from it. Case id:{" "}
              <code className="mono">{data.trace.trace_id}</code> · agent{" "}
              <code className="mono">{data.trace.agent_id}</code> ·{" "}
              <StatusBadge status={data.trace.status} />
            </p>
            {data.trace.chain_root_hash ? (
              <div style={{ marginBottom: "1rem" }}>
                <ChainRootPanel
                  chainRootHash={data.trace.chain_root_hash}
                  rootEventId={data.trace.root_event_id}
                  rootEventHash={data.trace.root_event_hash}
                />
              </div>
            ) : null}
            {data.events.length > 0 ? (
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
                        <td className="mono" style={{ fontSize: "0.75rem" }}>
                          {e.action_kind}
                        </td>
                        <td>
                          <StatusBadge status={e.policy_decision} />
                        </td>
                        <td className="mono">{e.tool_name ?? "-"}</td>
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
            ) : null}
          </details>
        </>
      ) : null}
    </ConsolePage>
  );
}
