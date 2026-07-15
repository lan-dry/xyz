"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  ConsolePage,
  ConsolePagination,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { AUDIT_PAGE_SIZES, useAuditListParams } from "@/hooks/use-audit-list-params";
import { TruncatedId } from "@/components/console/truncated-id";
import { consoleApi } from "@/lib/api";

type AuditLogRow = {
  audit_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_email: string | null;
};

type AuditLogsResponse = {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
};

export default function AuditLogsPage() {
  const { q, action, page, limit, queryString, setQuery, setAction, setPage, setLimit } =
    useAuditListParams(25);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) setQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, setQuery]);

  const actionsQuery = useQuery({
    queryKey: ["console", "audit-log-actions"],
    queryFn: () => consoleApi<{ actions: string[] }>("/audit-logs/actions"),
  });

  const logsQuery = useQuery({
    queryKey: ["console", "audit-logs", queryString],
    queryFn: () => consoleApi<AuditLogsResponse>(`/audit-logs?${queryString}`),
    placeholderData: (prev) => prev,
  });

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;
  const actions = actionsQuery.data?.actions ?? [];

  return (
    <ConsolePage>
      <PageHeader
        title="Logs"
        subtitle="Human and admin actions in the console (sign-in, members, policies, keys, exports, approvals). Agent runtime activity lives under Traces and Search."
      />

      <div
        className={`${ui.card} ${ui.cardPad}`}
        style={{ marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}
      >
        <label style={{ flex: "1 1 14rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Search</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Search size={16} aria-hidden style={{ color: "var(--console-fg-subtle)" }} />
            <input
              type="search"
              className={ui.input}
              placeholder="Action, resource, metadata…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </span>
        </label>
        <label style={{ flex: "0 1 14rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Action</span>
          <select
            className={ui.input}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {logsQuery.isPending && !logsQuery.data ? <LoadingBlock /> : null}
      {logsQuery.error ? <ErrorAlert message="Failed to load audit logs." /> : null}

      {!logsQuery.isPending && !logsQuery.error ? (
        <div className={ui.tableWrap} style={{ opacity: logsQuery.isFetching ? 0.65 : 1 }}>
          {logs.length === 0 ? (
            <div className={ui.cardPad}>
              <p className={ui.cardHint}>
                No audit events match. Member invites, API keys, and agent changes appear here.
              </p>
            </div>
          ) : (
            <>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.audit_id}>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td>{row.action}</td>
                      <td>
                        <span>{row.resource_type}</span>
                        {row.resource_id ? (
                          <div style={{ marginTop: "0.2rem" }}>
                            <TruncatedId value={row.resource_id} />
                          </div>
                        ) : null}
                      </td>
                      <td>{row.actor_email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ConsolePagination
                total={total}
                limit={limit}
                page={page}
                onPageChange={setPage}
                onLimitChange={(n) => setLimit(n as (typeof AUDIT_PAGE_SIZES)[number])}
                noun="entry"
                pageSizes={AUDIT_PAGE_SIZES}
              />
            </>
          )}
        </div>
      ) : null}
    </ConsolePage>
  );
}
