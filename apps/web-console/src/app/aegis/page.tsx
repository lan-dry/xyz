"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Shield, UserCheck } from "lucide-react";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  OutcomeChip,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { ConsoleTime } from "@/components/console/console-time";
import { SystemStatusStrip } from "@/components/console/system-status-strip";
import { useCaseSummaries } from "@/hooks/use-case-summaries";
import { consoleApi } from "@/lib/api";
import { emptyActionHref, useTenantCopy } from "@/lib/tenant-copy";
import { SandboxChecklist } from "./get-started/checklist";
import { agentLabel } from "@/lib/agent-label";
import { bankVocabChip, chipFromSummary, whatFromSummary } from "@/lib/case-row";
import { listSentenceFromTrace } from "@/lib/case-story";
import {
  environmentLabel,
  readConsoleEnvironment,
  type ConsoleEnvironment,
} from "@/lib/console-environment";
import type { TraceSummary } from "@/lib/types";

type OverviewMetrics = {
  environment: string;
  agent_count: number;
  active_policy_count: number;
  workflow_count: number;
  pending_approvals: number;
  policy_coverage_pct: number;
  unverified_event_count: number;
  events_24h: number;
  traces_24h: number;
  value_report_30d?: {
    actions: number;
    allowed: number;
    approvals_requested: number;
    stopped: number;
    amount_stopped_usd: number;
    avg_approval_seconds: number | null;
  };
};

export default function AegisDashboardPage() {
  const copy = useTenantCopy();
  const [environment, setEnvironment] = useState<ConsoleEnvironment>("production");

  useEffect(() => {
    setEnvironment(readConsoleEnvironment());
    function onEnv(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "sandbox" || detail === "production") setEnvironment(detail);
    }
    window.addEventListener("salanor:console-environment", onEnv);
    return () => window.removeEventListener("salanor:console-environment", onEnv);
  }, []);

  const overviewQuery = useQuery({
    queryKey: ["console", "overview", environment],
    queryFn: () =>
      consoleApi<{ overview: OverviewMetrics }>(`/overview?environment=${environment}`),
  });

  const tracesQuery = useQuery({
    queryKey: ["console", "traces", environment],
    queryFn: () =>
      consoleApi<{ traces: TraceSummary[] }>(`/traces?environment=${environment}&limit=50`),
  });

  const approvalsQuery = useQuery({
    queryKey: ["console", "approvals", "pending", environment],
    queryFn: () =>
      consoleApi<{
        approvals: Array<{
          approval_id: string;
          tool_name: string | null;
          trace_id: string;
          request_preview: { summary?: string; fields: Array<{ key: string; value: string }> };
        }>;
      }>(`/approvals?status=pending&environment=${environment}`),
  });

  const overview = overviewQuery.data?.overview;
  const traces = tracesQuery.data?.traces ?? [];
  const pendingApprovals = approvalsQuery.data?.approvals ?? [];
  const pending = overview?.pending_approvals ?? pendingApprovals.length;
  const blocked = traces.filter((t) => t.status === "blocked").length;
  const flagged = traces.filter(
    (t) =>
      Boolean(t.preview_anomaly_reason || t.preview_anomaly_type) &&
      t.status !== "blocked",
  ).length;
  const sortedTraces = [...traces].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  // Same plain facts and wording as the Live feed (amount, rule, approver names).
  const summariesQuery = useCaseSummaries(sortedTraces.map((t) => t.trace_id));
  const summaries = summariesQuery.data;
  const recent = sortedTraces
    .filter((t) => !summaries?.[t.trace_id]?.demo_filler)
    .slice(0, 6);

  const needsAttention = pending > 0 || blocked > 0 || flagged > 0;
  const loading =
    overviewQuery.isPending || tracesQuery.isPending || approvalsQuery.isPending;
  const error = overviewQuery.error || tracesQuery.error || approvalsQuery.error;

  return (
    <ConsolePage>
      <PageHeader
        title="Overview"
        subtitle={`What needs attention in ${environmentLabel(environment)}, and what ran recently.`}
        actions={
          <Link
            href="/aegis/live"
            className={`${ui.btn} ${ui.btnPrimary}`}
            title={copy.tooltip_live_feed}
          >
            Open live feed
          </Link>
        }
      />

      <SandboxChecklist />

      <SystemStatusStrip />

      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load dashboard." /> : null}

      {!loading && !error ? (
        <>
          <section
            className={`${ui.card} ${ui.cardPad}`}
            style={{ marginBottom: "1.25rem" }}
            aria-labelledby="attention-heading"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: needsAttention ? "1rem" : 0,
              }}
            >
              <h2 id="attention-heading" className={ui.panelTitle} style={{ margin: 0 }}>
                Needs attention
              </h2>
              {pending > 0 ? (
                <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnSecondary}`}>
                  Review approvals ({pending})
                </Link>
              ) : null}
            </div>

            {!needsAttention ? (
              <p className={ui.cardHint} style={{ margin: 0 }}>
                Nothing waiting. Open the live feed to watch new cases as they arrive.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {pending > 0 ? (
                  <li
                    style={{
                      padding: "0.75rem 0",
                      borderTop: "1px solid var(--console-border)",
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <UserCheck size={16} aria-hidden style={{ marginTop: "0.15rem", opacity: 0.7 }} />
                    <div>
                      <strong style={{ fontSize: "0.875rem" }}>
                        {pending} approval{pending === 1 ? "" : "s"} waiting
                      </strong>
                      <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                        {pendingApprovals[0]?.request_preview.summary ||
                          pendingApprovals[0]?.tool_name ||
                          "A person needs to approve before the action can continue."}
                      </p>
                      {pendingApprovals.length > 1 ? (
                        <p className={ui.cardHint} style={{ margin: "0.35rem 0 0" }}>
                          <Link href="/aegis/approvals" className={ui.tableLink}>
                            Open the approvals queue
                          </Link>
                        </p>
                      ) : pendingApprovals[0] ? (
                        <p className={ui.cardHint} style={{ margin: "0.35rem 0 0" }}>
                          <Link
                            href={`/aegis/approvals?focus=${encodeURIComponent(pendingApprovals[0].approval_id)}`}
                            className={ui.tableLink}
                          >
                            Open this approval
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </li>
                ) : null}
                {blocked > 0 ? (
                  <li
                    style={{
                      padding: "0.75rem 0",
                      borderTop: "1px solid var(--console-border)",
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <Shield size={16} aria-hidden style={{ marginTop: "0.15rem", opacity: 0.7 }} />
                    <div>
                      <strong style={{ fontSize: "0.875rem" }}>
                        {blocked} case{blocked === 1 ? "" : "s"} blocked
                      </strong>
                      <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                        Waiting for a decision before work can continue.{" "}
                        <Link href="/aegis/live" className={ui.tableLink}>
                          View in live feed
                        </Link>
                      </p>
                    </div>
                  </li>
                ) : null}
                {flagged > 0 ? (
                  <li
                    style={{
                      padding: "0.75rem 0",
                      borderTop: "1px solid var(--console-border)",
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <Activity size={16} aria-hidden style={{ marginTop: "0.15rem", opacity: 0.7 }} />
                    <div>
                      <strong style={{ fontSize: "0.875rem" }}>
                        {flagged} case{flagged === 1 ? "" : "s"} flagged
                      </strong>
                      <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                        Marked for review.{" "}
                        <Link href="/aegis/live" className={ui.tableLink}>
                          Open live feed
                        </Link>
                      </p>
                    </div>
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <section
            className={`${ui.card} ${ui.cardPad}`}
            style={{ marginBottom: "1.25rem" }}
            aria-labelledby="activity-heading"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h2 id="activity-heading" className={ui.panelTitle} style={{ margin: 0 }}>
                Recent activity
              </h2>
            </div>

            <p style={{ margin: "0 0 1rem", fontSize: "0.9375rem" }}>
              Last 24 hours:{" "}
              <strong>{overview?.traces_24h ?? 0}</strong> case
              {(overview?.traces_24h ?? 0) === 1 ? "" : "s"}
              {overview?.value_report_30d ? (
                <>
                  {" · "}
                  Last 30 days:{" "}
                  <strong>{overview.value_report_30d.stopped}</strong> stopped
                  {overview.value_report_30d.approvals_requested > 0
                    ? ` · ${overview.value_report_30d.approvals_requested} sent for approval`
                    : ""}
                </>
              ) : null}
            </p>

            {recent.length === 0 ? (
              <EmptyStatePanel
                title={copy.home_empty_title}
                description={copy.home_empty_body}
                action={
                  <Link
                    href={emptyActionHref(copy.home_empty_action)}
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    title={
                      copy.home_empty_action.includes("test")
                        ? copy.tooltip_test_event
                        : copy.tooltip_live_feed
                    }
                  >
                    {copy.home_empty_action}
                  </Link>
                }
              />
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {recent.map((t) => {
                  const row = listSentenceFromTrace(t);
                  const s = summaries?.[t.trace_id];
                  const chip =
                    chipFromSummary(s) ?? bankVocabChip(row.outcome.chip, row.outcome.kind);
                  return (
                    <li
                      key={t.trace_id}
                      style={{
                        padding: "0.85rem 0",
                        borderTop: "1px solid var(--console-border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: "1 1 16rem" }}>
                          <div style={{ marginBottom: "0.35rem" }}>
                            <OutcomeChip chip={chip.chip} kind={chip.kind} />
                            <span
                              style={{
                                marginLeft: "0.65rem",
                                fontSize: "0.75rem",
                                color: "var(--console-fg-subtle)",
                              }}
                            >
                              <ConsoleTime iso={t.started_at} />
                            </span>
                          </div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9375rem" }}>
                            {whatFromSummary(s) ?? row.sentence}
                          </p>
                          <p
                            style={{
                              margin: "0.3rem 0 0",
                              fontSize: "0.75rem",
                              color: "var(--console-fg-muted)",
                            }}
                          >
                            {agentLabel(t.agent_name, t.agent_id)}
                          </p>
                        </div>
                        <Link
                          href={`/aegis/traces/${encodeURIComponent(t.trace_id)}`}
                          className={`${ui.btn} ${ui.btnGhost}`}
                        >
                          View case
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

        </>
      ) : null}
    </ConsolePage>
  );
}
