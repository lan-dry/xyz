"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, KeyRound, UserCheck } from "lucide-react";

import {
  ConsolePage,
  EmptyState,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { DemoGuidePanel } from "@/components/console/demo-guide";
import { GovernanceInsightsPanel } from "@/components/console/governance-insights-panel";
import { consoleApi } from "@/lib/api";
import type { TraceSummary } from "@/lib/types";

export default function AegisDashboardPage() {
  const tracesQuery = useQuery({
    queryKey: ["console", "traces"],
    queryFn: () => consoleApi<{ traces: TraceSummary[] }>("/traces"),
  });

  const approvalsQuery = useQuery({
    queryKey: ["console", "approvals", "pending"],
    queryFn: () =>
      consoleApi<{ approvals: { approval_id: string }[] }>(
        "/approvals?status=pending",
      ),
  });

  const insightsQuery = useQuery({
    queryKey: ["console", "insights"],
    queryFn: () =>
      consoleApi<{
        insights: {
          headline: string;
          insights: Array<{
            id: string;
            severity: "info" | "attention" | "critical";
            title: string;
            detail: string;
            metric?: string;
          }>;
          period_days: number;
          trace_count: number;
          event_count: number;
        };
      }>("/insights"),
  });

  const traces = tracesQuery.data?.traces ?? [];
  const pending = approvalsQuery.data?.approvals.length ?? 0;
  const blocked = traces.filter((t) => t.status === "blocked").length;
  const recent = [...traces]
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    .slice(0, 5);

  const loading = tracesQuery.isPending || approvalsQuery.isPending;
  const error = tracesQuery.error || approvalsQuery.error;

  return (
    <ConsolePage>
      <PageHeader
        title="Dashboard"
        subtitle="Operational view of provenance, obligations, and policy for your organization."
        actions={
          <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnPrimary}`}>
            View all traces
          </Link>
        }
      />

      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load dashboard metrics." /> : null}

      {!loading && !error ? (
        <>
          <div className={ui.statGrid}>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Traces</p>
              <p className={ui.cardValue}>{traces.length}</p>
              <p className={ui.cardHint}>Recorded agent workflows</p>
            </div>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Pending approvals</p>
              <p className={ui.cardValue}>{pending}</p>
              <p className={ui.cardHint}>
                {pending > 0 ? (
                  <Link href="/aegis/approvals" className={ui.tableLink}>
                    Review queue →
                  </Link>
                ) : (
                  "No obligations waiting"
                )}
              </p>
            </div>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Blocked traces</p>
              <p className={ui.cardValue}>{blocked}</p>
              <p className={ui.cardHint}>Awaiting human decision</p>
            </div>
          </div>

          {insightsQuery.data?.insights ? (
            <GovernanceInsightsPanel
              headline={insightsQuery.data.insights.headline}
              insights={insightsQuery.data.insights.insights}
              subtitle={`Last ${insightsQuery.data.insights.period_days} days · ${insightsQuery.data.insights.trace_count} trace(s) · ${insightsQuery.data.insights.event_count} signed event(s)`}
            />
          ) : null}

          <DemoGuidePanel tracesCount={traces.length} />

          <div className={ui.twoCol} style={{ marginTop: "1.5rem" }}>
            <section className={`${ui.card} ${ui.cardPad}`}>
              <h2 className={ui.panelTitle}>Quick actions</h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                <li style={{ marginBottom: "0.75rem" }}>
                  <Link href="/aegis/traces" className={ui.tableLink}>
                    <Activity size={14} style={{ verticalAlign: "-2px" }} /> Browse
                    traces
                  </Link>
                </li>
                <li style={{ marginBottom: "0.75rem" }}>
                  <Link href="/aegis/approvals" className={ui.tableLink}>
                    <UserCheck size={14} style={{ verticalAlign: "-2px" }} /> Pending
                    approvals
                  </Link>
                </li>
                <li style={{ marginBottom: "0.75rem" }}>
                  <Link href="/aegis/keys" className={ui.tableLink}>
                    <KeyRound size={14} style={{ verticalAlign: "-2px" }} /> Ingest API
                    keys
                  </Link>
                </li>
                <li>
                  <Link href="/aegis/exports" className={ui.tableLink}>
                    Compliance exports
                  </Link>
                </li>
              </ul>
            </section>

            <section>
              <h2 className={ui.panelTitle}>Recent traces</h2>
              {recent.length === 0 ? (
                <div className={ui.tableWrap}>
                  <EmptyState
                    title="No traces yet"
                    description="Run pnpm demo:ingest after creating an ingest key."
                  />
                </div>
              ) : (
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        <th>Trace</th>
                        <th>Status</th>
                        <th>Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((t) => (
                        <tr key={t.trace_id}>
                          <td>
                            <Link
                              href={`/aegis/traces/${encodeURIComponent(t.trace_id)}`}
                              className={`${ui.tableLink} mono`}
                            >
                              {t.trace_id}
                            </Link>
                          </td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                          <td>{t.total_events}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </ConsolePage>
  );
}
