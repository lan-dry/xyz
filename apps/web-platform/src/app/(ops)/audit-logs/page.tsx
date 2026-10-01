"use client";

import { ClipboardList, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { OpsPagination } from "@/components/ops-pagination";
import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { useOpsListParams } from "@/hooks/use-ops-list-params";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";
import { formatAuditLocation } from "@/lib/client-geo-display";

type AuditRow = {
  audit_id: string;
  org_name: string;
  org_slug: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_email: string | null;
};

const AUDIT_PRESETS = [
  { label: "Sign-in success", action: "auth.login.success" },
  { label: "Sign-in failed", action: "auth.login.failed" },
] as const;

export default function AuditLogsPage() {
  const { email, logout } = usePlatformSession();
  const { q, action, limit, page, offset, setQuery, setAction, setPage, setLimit } =
    useOpsListParams(50);
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

  const queryString = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ...(action ? { action } : {}),
    ...(q ? { q } : {}),
  }).toString();

  const actionsQuery = useQuery({
    queryKey: ["platform", "audit-log-actions"],
    queryFn: () => platformApi<{ actions: string[] }>("audit-logs/actions"),
  });

  const logsQuery = useQuery({
    queryKey: ["platform", "audit-logs", queryString],
    queryFn: () =>
      platformApi<{ logs: AuditRow[]; total: number }>(`audit-logs?${queryString}`),
    placeholderData: (prev) => prev,
  });

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;
  const actions = actionsQuery.data?.actions ?? [];

  return (
    <OpsShell
      title="Audit log"
      subtitle="Console actions across all organizations."
      staffEmail={email}
      onLogout={logout}
    >
      <div
        className={`${ui.card} ${ui.cardPad}`}
        style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}
      >
        <label style={{ flex: "1 1 14rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Search</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Search size={16} aria-hidden style={{ color: "var(--console-fg-subtle)" }} />
            <input
              type="search"
              className={ui.input}
              placeholder="Action, org, metadata…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </span>
        </label>
        <label style={{ flex: "0 1 14rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Action</span>
          <select className={ui.input} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {AUDIT_PRESETS.map((preset) => (
          <button
            key={preset.action}
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{
              fontSize: "0.8125rem",
              padding: "0.35rem 0.75rem",
              ...(action === preset.action ? { borderColor: "var(--console-accent)" } : {}),
            }}
            onClick={() => setAction(preset.action)}
          >
            {preset.label}
          </button>
        ))}
        {action ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
            onClick={() => setAction("")}
          >
            Clear filter
          </button>
        ) : null}
      </div>

      {logsQuery.isLoading && !logsQuery.data ? (
        <p className={ui.loading}>Loading audit log…</p>
      ) : logs.length === 0 ? (
        <EmptyStatePanel
          icon={ClipboardList}
          title="No audit entries yet"
          description="Actions such as invites, API keys, and provisioning will appear here."
        />
      ) : (
        <div className={ui.tableWrap} style={{ opacity: logsQuery.isFetching ? 0.65 : 1 }}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Organization</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.audit_id}>
                  <td style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem" }}>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td>
                    <div>{row.org_name}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                      {row.org_slug}
                    </div>
                  </td>
                  <td style={{ color: "var(--console-fg-muted)" }}>{row.actor_email ?? "-"}</td>
                  <td className="mono" style={{ fontFamily: "var(--console-font-mono)" }}>
                    {row.action}
                  </td>
                  <td style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem" }}>
                    {row.resource_type}
                    {row.resource_id ? ` · ${row.resource_id}` : ""}
                  </td>
                  <td style={{ fontSize: "0.8125rem", maxWidth: "14rem" }}>
                    {formatAuditLocation(row.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <OpsPagination
            total={total}
            limit={limit}
            page={page}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      )}
    </OpsShell>
  );
}
