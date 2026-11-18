"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

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
import { ConsoleTime } from "@/components/console/console-time";
import { EvidenceDownloads } from "@/components/console/evidence-downloads";
import { SealChip } from "@/components/console/seal-chip";
import { useCaseSummaries } from "@/hooks/use-case-summaries";
import { consoleApi } from "@/lib/api";
import { idApi } from "@/lib/id-api";
import { agentLabel } from "@/lib/agent-label";
import { buildCaseStory, TREATMENT_LABEL } from "@/lib/case-story";
import { formatRuleLabel } from "@/lib/describe-decision";
import type {
  EventDetail,
  EventSpanGroup,
  MeResponse,
  SpanTreeNode,
  TraceSummary,
} from "@/lib/types";

const REVEAL_ROLES = new Set(["auditor", "admin", "owner"]);

export default function TraceDetailPage() {
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealError, setRevealError] = useState<string | null>(null);

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

  const summaryQuery = useCaseSummaries([traceId]);
  const caseSummary = summaryQuery.data?.[traceId];
  const canReveal = REVEAL_ROLES.has(meQuery.data?.user?.role ?? "");

  const revealMutation = useMutation({
    mutationFn: (fieldPath: string) =>
      consoleApi<{ field_path: string; value: string }>(
        `/cases/${encodeURIComponent(traceId)}/fields/reveal`,
        {
          method: "POST",
          body: JSON.stringify({ field_path: fieldPath }),
        },
      ),
    onSuccess: (res) => {
      setRevealError(null);
      setRevealed((prev) => ({ ...prev, [res.field_path]: res.value }));
    },
    onError: (err) => {
      setRevealError(err instanceof Error ? err.message : "Could not reveal field.");
    },
  });

  const story = data
    ? buildCaseStory(data.events, {
        summary: caseSummary
          ? {
              required_role: caseSummary.required_role,
              amount: caseSummary.amount,
              currency: caseSummary.currency,
              product: caseSummary.product,
              event_type: caseSummary.event_type,
              rules: caseSummary.rules,
              decided_by_rule_id: caseSummary.decided_by_rule_id ?? null,
              approvers: caseSummary.approvers,
              requester: caseSummary.requester,
              requester_email: caseSummary.requester_email ?? null,
              requester_officer_id: caseSummary.requester_officer_id ?? null,
            }
          : null,
        traceId: data.trace.trace_id,
        agentId: data.trace.agent_id,
        agentName: agentLabel(data.trace.agent_name, data.trace.agent_id),
        status: data.trace.status,
        pendingApproval: data.trace.pending_approval,
        deniedEvents: data.trace.denied_events,
        startedAt: data.trace.started_at,
      })
    : null;

  /** Reading-only summary. The signed evidence bundle is the independently verifiable file. */
  const summaryJson = () => ({
    note: "Summary for reading. Not independently verifiable.",
    case_id: data?.trace.trace_id,
    headline: story?.headline,
    outcome: story?.outcome.label,
    four_answers: story?.fourAnswers,
    data_seen: story?.dataSeen.map((f) => ({
      field: f.field,
      treatment: f.treatment,
      value: f.value,
    })),
    data_sensitivity: story?.dataSensitivity,
    anomaly: story?.anomalyReason
      ? { reason: story.anomalyReason, severity: story.anomalySeverity }
      : null,
    approval: story?.approver
      ? { by: story.approver, decision: story.approvalDecision, at: story.approvalAt }
      : null,
    evaluation_context: story?.evaluationContext,
    events: data?.events.map((e) => ({
      event_id: e.event_id,
      action_kind: e.action_kind,
      policy_decision: e.policy_decision,
      tool_name: e.tool_name,
      payload: e.payload,
      event_hash: e.event_hash,
      chain_valid: e.chain_valid,
    })),
  });

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
                {story.description ? (
                  <span style={{ display: "block", marginBottom: "0.35rem" }}>
                    {story.description}
                  </span>
                ) : null}
                <OutcomeChip chip={story.outcome.chip} kind={story.outcome.kind} />
                <span style={{ marginLeft: "0.65rem" }}>
                  <ConsoleTime iso={data.trace.started_at} />
                  <span
                    style={{ color: "var(--console-fg-subtle)", marginLeft: "0.35rem" }}
                    title="UTC"
                  >
                    (UTC {new Date(data.trace.started_at).toISOString()})
                  </span>
                </span>
              </>
            }
            actions={
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <EvidenceDownloads
                  traceId={traceId}
                  caseId={data.trace.trace_id}
                  summaryJson={summaryJson}
                />
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
            <strong>Seal:</strong> each step is signed and the record is append-only.
            Changing a field after signing fails verification. Download the evidence bundle
            to check it independently.
          </div>

          {story.flagSummary ? (
            <div className={`${ui.alert} ${ui.alertError}`} role="status">
              <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                Needs attention
                {story.anomalySeverity ? ` · ${story.anomalySeverity}` : ""}
              </strong>
              <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>
                {story.flagSummary}
              </p>
            </div>
          ) : null}

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
              {story.description || story.headline}
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
              {story.dataSeen.length > 0 ? (
                <>
                  <ul
                    style={{
                      margin: story.dataSensitivity ? "0 0 0.65rem" : 0,
                      paddingLeft: "1.1rem",
                      fontSize: "0.9375rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {story.dataSeen.map((f) => {
                      const clear = revealed[f.field];
                      const showReveal =
                        canReveal &&
                        f.treatment === "masked" &&
                        !clear &&
                        (f.field === "applicant_name" ||
                          f.field === "national_id" ||
                          /id$/i.test(f.field) ||
                          /name$/i.test(f.field));
                      return (
                        <li key={f.field}>
                          {f.label}
                          {clear
                            ? `: ${clear}`
                            : f.value
                              ? `: ${f.value}`
                              : ""}{" "}
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--console-fg-muted)",
                            }}
                          >
                            (
                            {clear
                              ? "revealed (logged)"
                              : TREATMENT_LABEL[f.treatment]}
                            )
                          </span>
                          {showReveal ? (
                            <>
                              {" "}
                              <button
                                type="button"
                                className={ui.tableLink}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                }}
                                disabled={revealMutation.isPending}
                                onClick={() => revealMutation.mutate(f.field)}
                              >
                                Reveal
                              </button>
                            </>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {revealError ? (
                    <p
                      style={{
                        margin: "0 0 0.65rem",
                        fontSize: "0.8125rem",
                        color: "var(--console-danger, #b91c1c)",
                      }}
                    >
                      {revealError}
                    </p>
                  ) : null}
                  {story.dataSensitivity ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.8125rem",
                        color: "var(--console-fg-muted)",
                      }}
                    >
                      Sensitivity: {story.dataSensitivity}
                    </p>
                  ) : null}
                </>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  This case did not send any data fields to Aegis.
                </p>
              )}
            </section>

            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>What was attempted</h2>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>
                {story.attempted}
              </p>
            </section>

            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>Decision</h2>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
                <OutcomeChip chip={story.outcome.chip} kind={story.outcome.kind} />
              </p>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5 }}>
                {story.bankDecision ??
                  story.policyReason ??
                  story.fourAnswers.whyAllowed.detail}
              </p>
              {story.ruleIds.length > 0 ? (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  Rule:{" "}
                  {story.ruleIds
                    .map((id) => formatRuleLabel(id))
                    .filter((x): x is string => Boolean(x))
                    .join(", ")}
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
              {story.requester ? (
                <p
                  style={{
                    margin: "0 0 0.65rem",
                    fontSize: "0.875rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  Requested by <strong>{story.requester}</strong>.
                </p>
              ) : null}
              {story.approver ? (
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  {story.approvalDecision === "rejected" ? "Declined" : "Approved"} by{" "}
                  <strong>{story.approver}</strong>
                  {story.approvalAt ? (
                    <>
                      {" "}
                      at <ConsoleTime iso={story.approvalAt} />
                    </>
                  ) : null}
                  .
                </p>
              ) : story.noApprovalNeeded ? (
                <p style={{ margin: 0, fontSize: "0.875rem" }}>{story.noApprovalNeeded}</p>
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
              {data.events.every((e) => e.chain_valid) ? (
                <>
                  <StatusBadge status="ok" />{" "}
                  <strong>Verified.</strong> Signature chain is intact on every
                  step.
                </>
              ) : (
                <>
                  Chain check failed on at least one step. Open Technical details.
                </>
              )}{" "}
              Each step is signed and the record is append-only. Changing a field after
              signing fails verification.
            </p>
            {caseSummary && caseSummary.seal !== "unknown" ? (
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem" }}>
                Seal status: <SealChip seal={caseSummary.seal} />
                {caseSummary.seal === "sealed_pending_witness" ? (
                  <span style={{ color: "var(--console-warning)", marginLeft: "0.5rem" }}>
                    The Salanor witness checkpoint has not confirmed yet. This does not change the
                    signature check above.
                  </span>
                ) : null}
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <EvidenceDownloads
                traceId={traceId}
                caseId={data.trace.trace_id}
                summaryJson={summaryJson}
                showCaptions
              />
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
            <SpanTreePanel
              tree={data.span_tree ?? []}
              orphanEvents={orphanEvents}
              payloadByEventId={Object.fromEntries(
                data.events.map((e) => [e.event_id, e.payload]),
              )}
            />
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
              {agentLabel(data.trace.agent_name, data.trace.agent_id)}
              {data.trace.agent_name?.trim() &&
              data.trace.agent_name.trim() !== data.trace.agent_id ? (
                <>
                  {" "}
                  (<code className="mono">{data.trace.agent_id}</code>)
                </>
              ) : null}{" "}
              · <StatusBadge status={data.trace.status} />
              {story?.requesterEmail || story?.requesterOfficerId ? (
                <>
                  <br />
                  Requester email:{" "}
                  <code className="mono">{story.requesterEmail ?? "—"}</code>
                  {story.requesterOfficerId ? (
                    <>
                      {" "}
                      · officer id:{" "}
                      <code className="mono">{story.requesterOfficerId}</code>
                    </>
                  ) : null}
                </>
              ) : null}
            </p>
            {data.events.every((e) => e.chain_valid) ? (
              <p
                style={{
                  margin: "0 0 1rem",
                  fontSize: "0.8125rem",
                  color: "var(--console-fg-muted)",
                }}
              >
                Seal chain: intact. Public witness or transparency inclusion may
                still be processing for a minute after ingest — that does not change
                the verified chain above.
              </p>
            ) : null}
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
