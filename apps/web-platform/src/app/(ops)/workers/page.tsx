"use client";

import { ServerCog } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { OpsPagination } from "@/components/ops-pagination";
import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { useOpsListParams } from "@/hooks/use-ops-list-params";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

type WorkerRunRow = {
  run_id: string;
  worker_name: "witness" | "compliance" | "housekeeping";
  status: "ok" | "error" | "skipped";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  summary: Record<string, unknown>;
  error_message: string | null;
};

const WORKERS = [
  { id: "", label: "All workers" },
  { id: "witness", label: "Witness (60s Merkle)" },
  { id: "compliance", label: "Compliance exports" },
  { id: "housekeeping", label: "Housekeeping" },
] as const;

function summaryPreview(summary: Record<string, unknown>): string {
  const batchCount = summary.batch_count;
  if (typeof batchCount === "number") {
    return `${batchCount} batch(es)`;
  }
  if (typeof summary.processed_exports === "number") {
    return `${summary.processed_exports} export(s), ${summary.scheduled_count ?? 0} scheduled`;
  }
  if (typeof summary.expired_approvals === "number") {
    return `${summary.expired_approvals} approval(s) expired, ${summary.stale_traces_failed ?? 0} trace(s) closed`;
  }
  return JSON.stringify(summary).slice(0, 80);
}

export default function WorkerRunsPage() {
  const { email, logout } = usePlatformSession();
  const { limit, page, offset, setPage, setLimit } = useOpsListParams(50);
  const [worker, setWorker] = useState("");

  const runsQuery = useQuery({
    queryKey: ["platform", "worker-runs", worker, limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (worker) params.set("worker", worker);
      return platformApi<{ runs: WorkerRunRow[]; total: number }>(
        `worker-runs?${params.toString()}`,
      );
    },
  });

  const runs = runsQuery.data?.runs ?? [];
  const total = runsQuery.data?.total ?? 0;

  return (
    <OpsShell
      title="Background workers"
      subtitle="Witness, compliance, and housekeeping runs recorded from Railway workers."
      staffEmail={email}
      onLogout={logout}
    >
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {WORKERS.map((w) => (
          <button
            key={w.id || "all"}
            type="button"
            className={`${ui.btn} ${worker === w.id ? ui.btnPrimary : ui.btnSecondary}`}
            onClick={() => {
              setWorker(w.id);
              setPage(1);
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {runsQuery.isLoading ? (
        <p className={ui.loading}>Loading worker runs…</p>
      ) : runs.length === 0 ? (
        <EmptyStatePanel
          icon={ServerCog}
          title="No worker runs yet"
          description="Deploy the witness worker on Railway. Each tick is logged here once migration 026 is applied."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Worker</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Summary</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr key={row.run_id}>
                  <td style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem" }}>
                    {new Date(row.started_at).toLocaleString()}
                  </td>
                  <td>{row.worker_name}</td>
                  <td>
                    <span
                      className={`${ui.badge} ${
                        row.status === "ok"
                          ? ui.badgeSuccess
                          : row.status === "error"
                            ? ui.badgeDanger
                            : ""
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem" }}>
                    {row.duration_ms != null ? `${row.duration_ms}ms` : "-"}
                  </td>
                  <td style={{ fontSize: "0.8125rem", maxWidth: "20rem" }}>
                    {summaryPreview(row.summary)}
                  </td>
                  <td style={{ color: "var(--ops-danger)", fontSize: "0.8125rem" }}>
                    {row.error_message ?? "-"}
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
