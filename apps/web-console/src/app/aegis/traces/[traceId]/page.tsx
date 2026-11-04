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
                <a
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(
                    JSON.stringify(
                      {
                        case_id: data.trace.trace_id,
                        headline: story.headline,
                        outcome: story.outcome.label,
                        four_answers: story.fourAnswers,
                        data_seen: story.dataTouched,
                        data_sensitivity: story.dataSensitivity,
                        events: data.events.map((e) => ({
                          event_id: e.event_id,
                          action_kind: e.action_kind,
                          policy_decision: e.policy_decision,
                          tool_name: e.tool_name,
                          event_hash: e.event_hash,
                          chain_valid: e.chain_valid,
                        })),
                      },
                      null,
                      2,
                    ),
                  )}`}
                  download={`aegis-receipt-${data.trace.trace_id.slice(0, 12)}.json`}
                >
                  Download receipt
                </a>
                <Link
                  href={`/aegis/traces/${encodeURIComponent(traceId)}/replay`}
                  className={`${ui.btn} ${ui.btnSecondary}`}
                >
                  Watch what happened
                </Link>
                {firstEventId && orgSlug ? (
                  <Link
                    href={`/verify?org=${encodeURIComponent(orgSlug)}&event=${encodeURIComponent(firstEventId)}`}
                    className={`${ui.btn} ${ui.btnGhost}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Verify seal
                  </Link>
                ) : firstEventId ? (
                  <Link
                    href={`/aegis/events/${encodeURIComponent(firstEventId)}`}
                    className={`${ui.btn} ${ui.btnGhost}`}
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

          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.8125rem",
              color: "var(--console-fg-muted)",
            }}
          >
            Full receipt below. On a wide screen the sections sit two-across.
            Technical hashes stay under Technical details at the bottom.
          </p>

          <section
            className={`${ui.card} ${ui.cardPad}`}
            style={{ marginBottom: "1rem" }}
          >
            <h2 className={ui.panelTitle}>What happened</h2>
            <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.55 }}>
              {story.headline}
            </p>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>What data was seen</h2>
              {story.dataTouched.length > 0 ? (
                <>
                  {story.dataSensitivity ? (
                    <p
                      style={{
                        margin: "0 0 0.65rem",
                        fontSize: "0.8125rem",
                        color: "var(--console-fg-muted)",
                      }}
                    >
                      Sensitivity:{" "}
                      <strong style={{ color: "var(--console-fg)" }}>
                        {story.dataSensitivity}
                      </strong>
                      <span>
                        {" "}
                        (declared by the agent when it recorded the read — Aegis does
                        not auto-classify content)
                      </span>
                    </p>
                  ) : null}
                  <ul
                    style={{
                      margin: "0 0 0.75rem",
                      paddingLeft: "1.1rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {story.dataTouched.map((field) => (
                      <li key={field}>{field.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8125rem",
                      color: "var(--console-fg-muted)",
                    }}
                  >
                    Accurate only if the agent (or SDK wrapper) called{" "}
                    <code className="mono">recordDataAccess</code> with the fields it
                    actually read.
                  </p>
                </>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  No field-level data-access events were recorded on this case.
                </p>
              )}
            </section>

            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>What was attempted</h2>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
                {story.attempted}
              </p>
              {story.anomalyReason ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  Flagged behaviour
                  {story.anomalySeverity ? ` (${story.anomalySeverity})` : ""}:{" "}
                  {story.anomalyReason}
                </p>
              ) : null}
            </section>

            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>Policy decision</h2>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
                <OutcomeChip chip={story.outcome.chip} kind={story.outcome.kind} />
              </p>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>
                {story.policyReason ?? story.fourAnswers.whyAllowed.detail}
              </p>
              {story.policyId ? (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  Rule set id: <code className="mono">{story.policyId}</code>
                  {story.policyId === "pol-data-access-demo" ? (
                    <>
                      {" "}
                      (demo seal from the pilot script — not a live Policies-page
                      rule yet)
                    </>
                  ) : null}
                </p>
              ) : null}
              {story.evaluationContext &&
              Object.keys(story.evaluationContext).length > 0 ? (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  Context used:{" "}
                  {Object.entries(story.evaluationContext)
                    .filter(([, v]) => v != null && v !== "")
                    .slice(0, 8)
                    .map(([k, v]) =>
                      Array.isArray(v)
                        ? `${k}=${v.join(", ")}`
                        : `${k}=${String(v)}`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
            </section>

            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>Who approved</h2>
              {story.approver ? (
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  {story.approvalDecision ?? "Decision"} by{" "}
                  <strong>{story.approver}</strong>
                  {story.approvalAt
                    ? ` at ${new Date(story.approvalAt).toLocaleString()}`
                    : ""}
                  .
                </p>
              ) : story.waitingForPerson || data.trace.pending_approval ? (
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  Waiting for a person.{" "}
                  <Link href="/aegis/approvals" className={ui.tableLink}>
                    Open approvals
                  </Link>
                </p>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  No approval is linked to this case. If you approved a different
                  receipt, open that case from Live feed or Approvals history.
                </p>
              )}
            </section>
          </div>

          <section
            className={`${ui.card} ${ui.cardPad}`}
            style={{ marginBottom: "1.5rem" }}
          >
            <h2 className={ui.panelTitle}>Verification status</h2>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
              {data.events.every((e) => e.chain_valid)
                ? "Chain valid — every sealed step checks out."
                : "Chain check failed on at least one step. Open Technical details."}
              {" "}
              Signatures are append-only; changing a field after signing fails
              verification.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <a
                className={`${ui.btn} ${ui.btnPrimary}`}
                href={`data:application/json;charset=utf-8,${encodeURIComponent(
                  JSON.stringify(
                    {
                      case_id: data.trace.trace_id,
                      headline: story.headline,
                      outcome: story.outcome.label,
                      four_answers: story.fourAnswers,
                      data_seen: story.dataTouched,
                      data_sensitivity: story.dataSensitivity,
                      anomaly: story.anomalyReason
                        ? {
                            reason: story.anomalyReason,
                            severity: story.anomalySeverity,
                          }
                        : null,
                      approval: story.approver
                        ? {
                            by: story.approver,
                            decision: story.approvalDecision,
                            at: story.approvalAt,
                          }
                        : null,
                      evaluation_context: story.evaluationContext,
                      events: data.events.map((e) => ({
                        event_id: e.event_id,
                        action_kind: e.action_kind,
                        policy_decision: e.policy_decision,
                        tool_name: e.tool_name,
                        payload: e.payload,
                        event_hash: e.event_hash,
                        chain_valid: e.chain_valid,
                      })),
                    },
                    null,
                    2,
                  ),
                )}`}
                download={`aegis-receipt-${data.trace.trace_id.slice(0, 12)}.json`}
              >
                Download receipt
              </a>
              {firstEventId && orgSlug ? (
                <Link
                  href={`/verify?org=${encodeURIComponent(orgSlug)}&event=${encodeURIComponent(firstEventId)}`}
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Verify seal
                </Link>
              ) : null}
              <Link href="/aegis/evidence" className={`${ui.btn} ${ui.btnGhost}`}>
                Open receipts / exports
              </Link>
            </div>
          </section>

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
