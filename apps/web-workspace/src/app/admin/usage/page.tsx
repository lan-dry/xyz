"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import { fetchAdminUsage } from "@/lib/stoa-client";

function formatBytes(n: number): string {
  if (n < 1024 * 1024) {
    return `${Math.round(n / 1024)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

export default function AdminUsagePage() {
  const [usage, setUsage] = useState<Awaited<
    ReturnType<typeof fetchAdminUsage>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminUsage()
      .then(setUsage)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <div className={ui.alertError}>{error}</div>;
  }
  if (!usage) {
    return <p className={ui.metaMuted}>Loading usage…</p>;
  }

  const q = usage.quotas;
  const msgPct = q.maxMessagesOrgMonth
    ? Math.min(100, Math.round((usage.usage.orgMessages / q.maxMessagesOrgMonth) * 100))
    : 0;
  const attachPct = q.maxAttachmentMbPerOrgMonth
    ? Math.min(
        100,
        Math.round(
          (usage.usage.orgAttachmentBytes / (q.maxAttachmentMbPerOrgMonth * 1024 * 1024)) *
            100,
        ),
      )
    : 0;

  const users = usage.users;

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Usage</h1>
        <p className={ui.pageSubtitle}>{formatMonth(usage.periodMonth)}</p>
      </header>

      {usage.notice ? (
        <div className={ui.alertError} style={{ marginBottom: "1rem" }}>
          Usage data is unavailable.
        </div>
      ) : null}

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Messages</p>
          <p className={ui.cardValue}>{usage.usage.orgMessages}</p>
          <p className={ui.metaMuted}>
            Limit {q.maxMessagesOrgMonth} ({msgPct}%)
          </p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Attachments</p>
          <p className={ui.cardValue} style={{ fontSize: "1.25rem" }}>
            {formatBytes(usage.usage.orgAttachmentBytes)}
          </p>
          <p className={ui.metaMuted}>
            Limit {q.maxAttachmentMbPerOrgMonth} MB ({attachPct}%)
          </p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Per person</p>
          <p className={ui.cardValue} style={{ fontSize: "1rem" }}>
            {q.maxMessagesPerUserMonth} messages a month
          </p>
          {q.enforce ? null : (
            <p className={ui.metaMuted}>Limits are not enforced</p>
          )}
        </div>
      </div>

      <h2 className={ui.sectionTitle}>By member (this month)</h2>
      {users.length === 0 ? (
        <EmptyStatePanel icon={BarChart3} title="No usage yet" />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Messages</th>
                <th>Conversations</th>
                <th>Attachments</th>
                <th>First seen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.displayName ? (
                      <>
                        {u.displayName}
                        <br />
                        <span className={ui.metaMuted}>{u.email}</span>
                      </>
                    ) : (
                      u.email
                    )}
                  </td>
                  <td>{u.messageCount}</td>
                  <td>{u.threadCount}</td>
                  <td>{formatBytes(u.attachmentBytes)}</td>
                  <td className={ui.metaMuted}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
