"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { adminCanWrite } from "@/lib/admin-session";

import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import {
  fetchAdminExecutiveSummary,
  fetchAdminReportsSummary,
  fetchModels,
  fetchSession,
  type SessionInfo,
} from "@/lib/stoa-client";

const EVENT_LABELS: Record<string, string> = {
  "message.completed": "Messages sent",
  "message.edited": "Messages edited",
  "gateway.completion": "API key requests",
  "admin.chat.reviewed": "Conversations reviewed",
  "admin.settings.updated": "Policy changes",
  "admin.providers.updated": "Provider changes",
  "admin.gateway.credential_created": "API keys created",
  "admin.gateway.credential_revoked": "API keys revoked",
  "admin.site.created": "Sites added",
  "admin.site.updated": "Sites edited",
  "admin.site.deleted": "Sites deleted",
  "admin.site.manager_added": "Site managers added",
  "admin.site.manager_removed": "Site managers removed",
  "admin.user.site_updated": "Member site changes",
  "admin.retention.run": "Data deletion runs",
  "retention.scheduled": "Scheduled data deletion",
  "admin.reports.ai_summary": "Summaries written",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const mb = n / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function formatMonth(periodMonth: string): string {
  const date = new Date(`${periodMonth.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return periodMonth;
  }
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AdminReportsPage() {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const canWrite = adminCanWrite(session);

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
  }, []);
  const summaryQuery = useQuery({
    queryKey: ["stoa", "admin", "reports", "summary"],
    queryFn: fetchAdminReportsSummary,
  });

  const modelsQuery = useQuery({
    queryKey: ["stoa", "models"],
    queryFn: fetchModels,
  });

  const aiMutation = useMutation({
    mutationFn: fetchAdminExecutiveSummary,
    onSuccess: (data) => setAiSummary(data.summary),
  });

  const data = summaryQuery.data;

  const modelLabels = useMemo(
    () => new Map((modelsQuery.data ?? []).map((m) => [m.id, m.label])),
    [modelsQuery.data],
  );

  const auditRows = useMemo(() => {
    const rows = new Map<string, number>();
    let other = 0;
    for (const e of data?.auditLast30Days ?? []) {
      const label = EVENT_LABELS[e.eventType];
      if (label) {
        rows.set(label, (rows.get(label) ?? 0) + e.count);
      } else {
        other += e.count;
      }
    }
    const list = [...rows.entries()].map(([label, count]) => ({ label, count }));
    if (other > 0) {
      list.push({ label: "Other", count: other });
    }
    return list;
  }, [data?.auditLast30Days]);

  if (summaryQuery.isPending) {
    return <p className={ui.metaMuted}>Loading reports…</p>;
  }

  if (summaryQuery.isError || !data) {
    return (
      <div className={ui.alertError}>
        {summaryQuery.error instanceof Error
          ? summaryQuery.error.message
          : "Failed to load reports"}
      </div>
    );
  }

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Reports</h1>
      </header>

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Period</p>
          <p className={ui.cardValue}>{formatMonth(data.periodMonth)}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Messages</p>
          <p className={ui.cardValue}>{data.usage.orgMessages.toLocaleString()}</p>
          {data.usage.quotaPercent > 0 ? (
            <p className={ui.metaMuted}>{data.usage.quotaPercent}% of monthly limit</p>
          ) : null}
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Attachments</p>
          <p className={ui.cardValue}>
            {formatBytes(data.usage.orgAttachmentBytes)}
          </p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Private details hidden</p>
          <p className={ui.cardValue}>{data.redactionTotal.toLocaleString()}</p>
        </div>
      </div>

      <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Insights
        </h2>
        <ul className={ui.checkList}>
          {data.insights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className={ui.toolbar} style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={!canWrite || aiMutation.isPending}
            onClick={() => aiMutation.mutate()}
          >
            {aiMutation.isPending ? "Writing…" : "Write summary"}
          </button>
        </div>
        {aiMutation.isError ? (
          <p className={ui.alertError} style={{ marginTop: "0.75rem" }}>
            {aiMutation.error instanceof Error
              ? aiMutation.error.message
              : "Summary failed"}
          </p>
        ) : null}
        {aiSummary ? (
          <div className={ui.notice} style={{ marginTop: "0.75rem" }}>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{aiSummary}</p>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1.25rem",
        }}
      >
        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Models
          </h2>
          {data.models.length === 0 ? (
            <p className={ui.metaMuted}>No messages yet.</p>
          ) : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((m) => {
                    const label = modelLabels.get(m.modelId);
                    return (
                      <tr key={m.modelId}>
                        <td className={label ? undefined : ui.mono}>
                          {label ?? m.modelId}
                        </td>
                        <td>{m.userMessages}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Top members
          </h2>
          {data.topUsers.length === 0 ? (
            <EmptyStatePanel icon={BarChart3} title="No activity yet" />
          ) : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.map((u) => (
                    <tr key={u.email}>
                      <td>{u.email}</td>
                      <td>{u.userMessages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {data.siteActivity.length > 0 ? (
        <div className={ui.card} style={{ marginTop: "1.25rem" }}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            By site
          </h2>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Messages</th>
                </tr>
              </thead>
              <tbody>
                {data.siteActivity.map((s) => (
                  <tr key={s.site}>
                    <td>{s.site}</td>
                    <td>{s.userMessages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {auditRows.length > 0 ? (
        <div className={ui.card} style={{ marginTop: "1.25rem" }}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Activity in the last 30 days
          </h2>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((e) => (
                  <tr key={e.label}>
                    <td>{e.label}</td>
                    <td>{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
