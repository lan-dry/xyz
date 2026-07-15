"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

type ApprovalSummary = {
  approval_id: string;
  event_id: string;
  status: string;
  trace_id: string;
  tool_name: string | null;
  agent_id: string;
  created_at: string;
};

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusRef = useRef<HTMLDivElement | null>(null);

  const pendingQuery = useQuery({
    queryKey: ["console", "approvals", "pending"],
    queryFn: () =>
      consoleApi<{ approvals: ApprovalSummary[] }>("/approvals?status=pending"),
  });

  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusId, pendingQuery.data]);

  const approve = useMutation({
    mutationFn: (approvalId: string) =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(approvalId)}/approve`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
  });

  const reject = useMutation({
    mutationFn: (approvalId: string) =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(approvalId)}/reject`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
  });

  const pending = pendingQuery.data?.approvals ?? [];
  const isEmpty = pending.length === 0 && !pendingQuery.isLoading;

  return (
    <ConsolePage>
      <PageHeader
        title="Approvals"
        subtitle={
          <>
            Tools with <code className="mono">allow_with_obligation</code> pause the
            trace until you approve or reject here.
          </>
        }
      />

      {isEmpty ? (
        <div className={ui.statStrip}>
          <span>
            <strong>0</strong> pending
          </span>
          <span>
            <strong>0</strong> blocked traces
          </span>
        </div>
      ) : null}

      {pendingQuery.isLoading ? <LoadingBlock /> : null}
      {pendingQuery.error ? (
        <ErrorAlert message="Failed to load pending approvals." />
      ) : null}

      {isEmpty ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title="No pending approvals"
          description="When a policy returns allow_with_obligation, the trace waits here until an operator approves or rejects the tool call."
          action={
            <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnSecondary}`}>
              View traces
            </Link>
          }
          secondary={
            <>
              Trigger a demo obligation:{" "}
              <code className="mono">pnpm demo:approval</code> with ingest configured.
            </>
          }
        />
      ) : null}

      {pending.map((a) => (
        <div
          key={a.approval_id}
          ref={a.approval_id === focusId ? focusRef : undefined}
          className={ui.listCard}
          style={
            a.approval_id === focusId
              ? { outline: "2px solid var(--console-accent, #2563eb)" }
              : undefined
          }
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>
                {a.tool_name ?? "Unknown tool"}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--console-fg-muted)",
                }}
              >
                Trace{" "}
                <Link
                  href={`/aegis/traces/${encodeURIComponent(a.trace_id)}`}
                  className={ui.tableLink}
                >
                  {a.trace_id}
                </Link>{" "}
                · Agent <span className="mono">{a.agent_id}</span>
              </p>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.75rem",
                  color: "var(--console-fg-subtle)",
                }}
              >
                {new Date(a.created_at).toLocaleString()}
              </p>
            </div>
            <div className={ui.formRow}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => approve.mutate(a.approval_id)}
                disabled={approve.isPending || reject.isPending}
              >
                Approve
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnDanger}`}
                onClick={() => reject.mutate(a.approval_id)}
                disabled={approve.isPending || reject.isPending}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </ConsolePage>
  );
}
