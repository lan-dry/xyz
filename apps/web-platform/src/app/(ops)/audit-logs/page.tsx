"use client";

import { ClipboardList } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { OpsPagination } from "@/components/ops-pagination";
import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { useOpsListParams } from "@/hooks/use-ops-list-params";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

type AuditRow = {
  audit_id: string;
  org_name: string;
  org_slug: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
  actor_email: string | null;
};

export default function AuditLogsPage() {
  const { email, logout } = usePlatformSession();
  const { limit, page, offset, setPage, setLimit } = useOpsListParams(50);

  const logsQuery = useQuery({
    queryKey: ["platform", "audit-logs", limit, offset],
    queryFn: () =>
      platformApi<{ logs: AuditRow[]; total: number }>(
        `audit-logs?limit=${limit}&offset=${offset}`,
      ),
  });

  const logs = logsQuery.data?.logs ?? [];
  const total = logsQuery.data?.total ?? 0;

  return (
    <OpsShell
      title="Audit log"
      subtitle="Console actions across all organizations."
      staffEmail={email}
      onLogout={logout}
    >
      {logsQuery.isLoading ? (
        <p className={ui.loading}>Loading audit log…</p>
      ) : logs.length === 0 ? (
        <EmptyStatePanel
          icon={ClipboardList}
          title="No audit entries yet"
          description="Actions such as invites, API keys, and provisioning will appear here."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Organization</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
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
                  <td style={{ color: "var(--console-fg-muted)" }}>{row.actor_email ?? "—"}</td>
                  <td className="mono" style={{ fontFamily: "var(--console-font-mono)" }}>
                    {row.action}
                  </td>
                  <td style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem" }}>
                    {row.resource_type}
                    {row.resource_id ? ` · ${row.resource_id}` : ""}
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
