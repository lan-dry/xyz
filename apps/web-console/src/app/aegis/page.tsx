"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, FileCheck, KeyRound, Shield, UserCheck } from "lucide-react";

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
import { MetricSparkline, MetricTrend } from "@/components/console/metric-visuals";
import { SystemStatusStrip } from "@/components/console/system-status-strip";
import { consoleApi } from "@/lib/api";
import { seriesFromTimestamps, sumSeriesFromTimestamps, trendPercent } from "@/lib/metric-series";
import type { TraceSummary } from "@/lib/types";

function DashboardStat({
  title,
  value,
  hint,
  icon: Icon,
  sparkline,
  trendPct,
  accent,
}: {
  title: string;
  value: number;
  hint: React.ReactNode;
  icon: typeof Activity;
  sparkline?: number[];
  trendPct?: number | null;
  accent?: string;
}) {
  return (
    <div className={`${ui.card} ${ui.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
        <p className={ui.cardTitle} style={{ margin: 0 }}>
          {title}
        </p>
        <Icon size={18} aria-hidden style={{ opacity: 0.45, flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "0.75rem" }}>
        <div>
          <p className={ui.cardValue} style={{ margin: 0 }}>
            {value}
          </p>
          <p className={ui.cardHint} style={{ margin: "0.35rem 0 0" }}>
            {hint}
          </p>
          {trendPct !== undefined ? (
            <div style={{ marginTop: "0.35rem" }}>
              <MetricTrend percent={trendPct ?? null} />
            </div>
          ) : null}
        </div>
        {sparkline ? (
          <MetricSparkline values={sparkline} color={accent} width={96} height={32} />
        ) : null}
      </div>
    </div>
  );
}

export default function AegisDashboardPage() {
  const tracesQuery = useQuery({
    queryKey: ["console", "traces"],
    queryFn: () => consoleApi<{ traces: TraceSummary[] }>("/traces"),
  });

  const approvalsQuery = useQuery({
    queryKey: ["console", "approvals", "pending"],
    queryFn: () =>
      consoleApi<{
        approvals: Array<{
          approval_id: string;
          tool_name: string | null;
          trace_id: string;
          request_preview: { summary?: string; fields: Array<{ key: string; value: string }> };
        }>;
      }>("/approvals?status=pending"),
  });

  const policiesQuery = useQuery({
    queryKey: ["console", "policies"],
    queryFn: () =>
      consoleApi<{ policies: Array<{ status: string }> }>("/policies"),
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
  const pendingApprovals = approvalsQuery.data?.approvals ?? [];
  const pending = pendingApprovals.length;
  const blocked = traces.filter((t) => t.status === "blocked").length;
  const executing = traces.filter((t) => t.status === "executing").length;
  const activePolicies =
    policiesQuery.data?.policies.filter((p) => p.status === "active").length ?? 0;
  const recent = [...traces]
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    .slice(0, 5);

  const traceSparkline = seriesFromTimestamps(traces.map((t) => t.started_at));
  const traceTrend = trendPercent(traceSparkline);
  const eventSparkline = sumSeriesFromTimestamps(
    traces.map((t) => ({ at: t.started_at, amount: t.total_events })),
  );
  const eventTrend = trendPercent(eventSparkline);
  const blockedSparkline = seriesFromTimestamps(
    traces.filter((t) => t.status === "blocked").map((t) => t.started_at),
  );

  const loading = tracesQuery.isPending || approvalsQuery.isPending;
  const error = tracesQuery.error || approvalsQuery.error;

  return (
    <ConsolePage>
      <PageHeader
        title="Dashboard"
        subtitle="Operational view of provenance, obligations, and policy for your organization."
        actions={
          pending > 0 ? (
            <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnPrimary}`}>
              Review approvals ({pending})
            </Link>
          ) : (
            <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnPrimary}`}>
              View all traces
            </Link>
          )
        }
      />

      <SystemStatusStrip />

      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load dashboard metrics." /> : null}

      {!loading && !error ? (
        <>
          <div className={ui.statGrid}>
            <DashboardStat
              title="Pending approvals"
              value={pending}
              icon={UserCheck}
              hint={
                pending > 0 ? (
                  <Link href="/aegis/approvals" className={ui.tableLink}>
                    Review queue
                  </Link>
                ) : (
                  "No obligations waiting"
                )
              }
            />
            <DashboardStat
              title="Blocked traces"
              value={blocked}
              icon={Shield}
              hint="Awaiting human decision"
              sparkline={blockedSparkline}
              accent="#c24141"
            />
            <DashboardStat
              title="Executing"
              value={executing}
              icon={Activity}
              hint="Approved, workflow side effects in progress"
            />
            <DashboardStat
              title="Traces"
              value={traces.length}
              icon={Activity}
              hint="Recorded agent workflows · 7-day trend"
              sparkline={traceSparkline}
              trendPct={traceTrend}
            />
            <DashboardStat
              title="Signed events"
              value={traces.reduce((n, t) => n + t.total_events, 0)}
              icon={FileCheck}
              hint="Across all traces · 7-day volume"
              sparkline={eventSparkline}
              trendPct={eventTrend}
              accent="var(--console-accent)"
            />
            <DashboardStat
              title="Active policies"
              value={activePolicies}
              icon={KeyRound}
              hint={
                <Link href="/aegis/policies" className={ui.tableLink}>
                  Manage policies
                </Link>
              }
            />
          </div>

          {pending > 0 ? (
            <section className={`${ui.card} ${ui.cardPad}`} style={{ marginTop: "1.5rem" }}>
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
                <h2 className={ui.panelTitle} style={{ margin: 0 }}>
                  Approvals need attention
                </h2>
                <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnPrimary}`}>
                  Open approvals
                </Link>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {pendingApprovals.slice(0, 3).map((a) => (
                  <li
                    key={a.approval_id}
                    style={{
                      padding: "0.75rem 0",
                      borderTop: "1px solid var(--console-border)",
                    }}
                  >
                    <Link
                      href={`/aegis/approvals?focus=${encodeURIComponent(a.approval_id)}`}
                      className={ui.tableLink}
                      style={{ fontWeight: 600 }}
                    >
                      {a.tool_name ?? "Unknown tool"}
                    </Link>
                    <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                      {a.request_preview.summary ??
                        a.request_preview.fields
                          .slice(0, 2)
                          .map((f) => `${f.key}: ${f.value}`)
                          .join(" · ") ??
                        "Review before side effects run"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
                  <Link href="/aegis/approvals" className={ui.tableLink}>
                    <UserCheck size={14} style={{ verticalAlign: "-2px" }} /> Pending
                    approvals
                  </Link>
                </li>
                <li style={{ marginBottom: "0.75rem" }}>
                  <Link href="/aegis/traces" className={ui.tableLink}>
                    <Activity size={14} style={{ verticalAlign: "-2px" }} /> Browse
                    traces
                  </Link>
                </li>
                <li style={{ marginBottom: "0.75rem" }}>
                  <Link href="/aegis/policies" className={ui.tableLink}>
                    <Shield size={14} style={{ verticalAlign: "-2px" }} /> Policy
                    engine
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
                    description="Create an ingest API key, then send signed APS-1 events from your runtime or automation workflow."
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
