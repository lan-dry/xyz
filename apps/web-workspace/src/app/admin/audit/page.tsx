"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";

import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import { fetchAdminAudit } from "@/lib/stoa-client";

const PAGE_SIZE = 50;

const EVENT_LABELS: Record<string, string> = {
  "message.completed": "Message sent",
  "message.edited": "Message edited",
  "gateway.completion": "API request",
  "admin.settings.updated": "Policy changed",
  "admin.providers.updated": "Provider changed",
  "admin.chat.reviewed": "Conversation opened by admin",
  "admin.gateway.credential_created": "API key created",
  "admin.gateway.credential_revoked": "API key revoked",
  "admin.retention.run": "Retention run",
  "retention.scheduled": "Scheduled retention run",
  "admin.site.created": "Site created",
  "admin.site.updated": "Site updated",
  "admin.site.deleted": "Site deleted",
  "admin.site.manager_added": "Site manager added",
  "admin.site.manager_removed": "Site manager removed",
  "admin.user.site_updated": "Member site changed",
  "admin.reports.ai_summary": "Report summary written",
};

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

function withheldCount(meta: Record<string, unknown>): number {
  if (Array.isArray(meta.redactionManifest)) {
    return (meta.redactionManifest as { count?: number }[]).reduce(
      (sum, e) => sum + (typeof e.count === "number" ? e.count : 1),
      0,
    );
  }
  return typeof meta.redactionCount === "number" ? meta.redactionCount : 0;
}

function formatDetails(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  const model =
    typeof meta.modelId === "string"
      ? meta.modelId
      : typeof meta.model === "string"
        ? meta.model
        : null;
  if (model) {
    parts.push(model);
  }
  const withheld = withheldCount(meta);
  if (withheld > 0) {
    parts.push(`${withheld} ${withheld === 1 ? "value" : "values"} withheld`);
  }
  if (
    typeof meta.messagesDeleted === "number" &&
    typeof meta.threadsDeleted === "number" &&
    typeof meta.attachmentsDeleted === "number"
  ) {
    parts.push(
      `Deleted ${meta.messagesDeleted} messages, ${meta.threadsDeleted} conversations, ${meta.attachmentsDeleted} files`,
    );
  }
  return parts.join(" · ");
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const auditQuery = useQuery({
    queryKey: ["admin-audit", page],
    queryFn: () =>
      fetchAdminAudit({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const events = auditQuery.data?.events ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Audit log</h1>
      </header>

      {auditQuery.isError ? (
        <div className={ui.alertError}>{auditQuery.error.message}</div>
      ) : null}

      {auditQuery.isPending ? (
        <p className={ui.metaMuted}>Loading audit log…</p>
      ) : auditQuery.isError && !auditQuery.data ? null : total === 0 ? (
        <EmptyStatePanel
          icon={ScrollText}
          title="No audit events yet"
          description="Events appear when members use the workspace or admins change settings."
        />
      ) : (
        <>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Event</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>
                      {e.userEmail ?? (
                        <span className={ui.emptyValue}>System</span>
                      )}
                    </td>
                    <td title={e.eventType}>{eventLabel(e.eventType)}</td>
                    <td className={ui.metaMuted}>{formatDetails(e.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={ui.pager}>
            <span>
              Showing {from} to {to} of {total}
              {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : null}
            </span>
            <div className={ui.pagerActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={page <= 1 || auditQuery.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} aria-hidden />
                Previous
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={page >= totalPages || auditQuery.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
