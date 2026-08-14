"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { ConsolePagination } from "@/components/console/console-pagination";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

type RequestPreview = {
  amount_usd?: number;
  summary?: string;
  fields: Array<{ key: string; value: string }>;
};

type ApprovalSummary = {
  approval_id: string;
  event_id: string;
  status: string;
  trace_id: string;
  tool_name: string | null;
  agent_id: string;
  created_at: string;
  expires_at: string | null;
  decided_at: string | null;
  approver_email: string | null;
  policy_reason: string | null;
  request_preview: RequestPreview;
  event_payload?: Record<string, unknown> | null;
};

function expiresLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${mins}m`;
}

function payloadDiffLines(
  preview: RequestPreview,
  payload: Record<string, unknown> | null | undefined,
): Array<{ key: string; preview?: string; raw?: string }> {
  const nested =
    payload?.request_payload && typeof payload.request_payload === "object"
      ? (payload.request_payload as Record<string, unknown>)
      : null;
  if (!nested) return [];
  const lines: Array<{ key: string; preview?: string; raw?: string }> = [];
  for (const [key, value] of Object.entries(nested)) {
    if (value == null || typeof value === "object") continue;
    const raw = String(value);
    const previewVal =
      key === "amount_usd" || key === "amount"
        ? preview.amount_usd != null
          ? String(preview.amount_usd)
          : raw
        : preview.fields.find((f) => f.key === key)?.value;
    lines.push({ key, preview: previewVal, raw });
  }
  return lines;
}

function ApprovalCard({
  approval: a,
  focusRef,
  focused,
  onApprove,
  onReject,
  onViewDetails,
  busy,
  showDecided,
}: {
  approval: ApprovalSummary;
  focusRef?: RefObject<HTMLDivElement | null>;
  focused?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onViewDetails?: () => void;
  busy?: boolean;
  showDecided?: boolean;
}) {
  const preview = a.request_preview;
  const expiry = expiresLabel(a.expires_at);

  return (
    <div
      ref={focusRef}
      className={ui.listCard}
      style={
        focused ? { outline: "2px solid var(--console-accent, #2563eb)" } : undefined
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
        <div style={{ flex: "1 1 16rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: "1.05rem" }}>
              {a.tool_name ?? "Unknown tool"}
            </p>
            {showDecided ? <StatusBadge status={a.status} /> : null}
          </div>
          {a.policy_reason ? (
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.875rem",
                color: "var(--console-fg-muted)",
              }}
            >
              {a.policy_reason}
            </p>
          ) : null}
          {preview.summary && preview.summary !== a.policy_reason ? (
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.8125rem",
                color: "var(--console-fg-subtle)",
              }}
            >
              {preview.summary}
            </p>
          ) : null}

          {(preview.amount_usd != null ||
            preview.fields.length > 0 ||
            (!showDecided && a.status === "pending")) && (
            <div
              className={ui.card}
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem 1rem",
                background: "var(--console-bg-subtle, rgba(0,0,0,0.03))",
              }}
            >
              <p
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--console-fg-subtle)",
                }}
              >
                Request details
              </p>
              {preview.amount_usd != null ? (
                <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>
                  ${preview.amount_usd.toLocaleString()} USD
                </p>
              ) : null}
              {preview.fields.map((f) => (
                <p
                  key={f.key}
                  style={{ margin: "0.15rem 0", fontSize: "0.8125rem" }}
                >
                  <span style={{ color: "var(--console-fg-muted)" }}>{f.key}:</span>{" "}
                  {f.value}
                </p>
              ))}
              {preview.amount_usd == null && preview.fields.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--console-fg-subtle)" }}>
                  No business context attached. In n8n, add a <strong>Set</strong> node
                  before Check Policy with fields like{" "}
                  <code className="mono">amount_usd</code>,{" "}
                  <code className="mono">recipient</code>, and{" "}
                  <code className="mono">summary</code>.
                </p>
              ) : null}
            </div>
          )}

          {showDecided && a.approver_email ? (
            <div
              className={ui.card}
              style={{
                marginTop: "0.75rem",
                padding: "0.65rem 0.875rem",
                background:
                  a.status === "approved"
                    ? "color-mix(in srgb, var(--console-success) 10%, transparent)"
                    : a.status === "rejected"
                      ? "color-mix(in srgb, var(--console-danger) 10%, transparent)"
                      : "var(--console-bg-subtle)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                {a.status === "approved"
                  ? "Approved by"
                  : a.status === "rejected"
                    ? "Rejected by"
                    : "Decided by"}{" "}
                <span className="mono">{a.approver_email}</span>
              </p>
              {a.decided_at ? (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  {new Date(a.decided_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          <p
            style={{
              margin: "0.75rem 0 0",
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
            </Link>
            {" · "}
            <Link
              href={`/aegis/events/${encodeURIComponent(a.event_id)}`}
              className={ui.tableLink}
            >
              View signed event
            </Link>
          </p>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.75rem",
              color: "var(--console-fg-subtle)",
            }}
          >
            Agent <span className="mono">{a.agent_id}</span>
            {" · "}
            Requested {new Date(a.created_at).toLocaleString()}
            {expiry && !showDecided ? ` · ${expiry}` : null}
          </p>
        </div>
        {onApprove && onReject ? (
          <div className={ui.formRow} style={{ alignSelf: "flex-start" }}>
            {onViewDetails ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={onViewDetails}
              >
                View details
              </button>
            ) : null}
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={onApprove}
              disabled={busy}
            >
              Approve
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnDanger}`}
              onClick={onReject}
              disabled={busy}
            >
              Reject
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(25);
  const [historyDecision, setHistoryDecision] = useState<
    "all" | "approved" | "rejected" | "expired"
  >("all");
  const [historyTool, setHistoryTool] = useState("");
  const [historyToolDraft, setHistoryToolDraft] = useState("");
  const [decidedIds, setDecidedIds] = useState<Set<string>>(() => new Set());
  const [actingId, setActingId] = useState<string | null>(null);

  const governanceQuery = useQuery({
    queryKey: ["console", "governance-settings"],
    queryFn: () =>
      consoleApi<{ settings: { approval_ttl_hours: number } }>("/governance/settings"),
  });

  const detailQuery = useQuery({
    queryKey: ["console", "approvals", "detail", detailId],
    queryFn: () =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(detailId!)}`,
      ),
    enabled: Boolean(detailId),
  });

  const pendingQuery = useQuery({
    queryKey: ["console", "approvals", "pending"],
    queryFn: () =>
      consoleApi<{ approvals: ApprovalSummary[]; blocked_traces?: number }>(
        "/approvals?status=pending",
      ),
  });

  const historyQuery = useQuery({
    queryKey: [
      "console",
      "approvals",
      "history",
      historyPage,
      historyLimit,
      historyDecision,
      historyTool,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        status: "history",
        limit: String(historyLimit),
        offset: String((historyPage - 1) * historyLimit),
        decision: historyDecision,
      });
      if (historyTool.trim()) {
        params.set("tool", historyTool.trim());
      }
      return consoleApi<{ approvals: ApprovalSummary[]; total: number }>(
        `/approvals?${params.toString()}`,
      );
    },
    enabled: tab === "history",
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
    onMutate: (approvalId) => {
      setActingId(approvalId);
      setDecidedIds((prev) => new Set(prev).add(approvalId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
    onError: (_err, approvalId) => {
      setDecidedIds((prev) => {
        const next = new Set(prev);
        next.delete(approvalId);
        return next;
      });
    },
    onSettled: () => {
      setActingId(null);
    },
  });

  const reject = useMutation({
    mutationFn: (approvalId: string) =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(approvalId)}/reject`,
        { method: "POST" },
      ),
    onMutate: (approvalId) => {
      setActingId(approvalId);
      setDecidedIds((prev) => new Set(prev).add(approvalId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
    onError: (_err, approvalId) => {
      setDecidedIds((prev) => {
        const next = new Set(prev);
        next.delete(approvalId);
        return next;
      });
    },
    onSettled: () => {
      setActingId(null);
    },
  });

  const pending = (pendingQuery.data?.approvals ?? []).filter(
    (a) => !decidedIds.has(a.approval_id),
  );
  const history = historyQuery.data?.approvals ?? [];
  const historyTotal = historyQuery.data?.total ?? 0;
  const blockedTraces = pendingQuery.data?.blocked_traces ?? pending.length;
  const isEmptyPending = pending.length === 0 && !pendingQuery.isLoading;
  const ttlHours = governanceQuery.data?.settings.approval_ttl_hours ?? 24;
  const detailApproval = detailQuery.data?.approval;
  const detailDiff = detailApproval
    ? payloadDiffLines(detailApproval.request_preview, detailApproval.event_payload)
    : [];

  return (
    <ConsolePage>
      <PageHeader
        title="Approvals"
        subtitle={
          <>
            Human-in-the-loop for <code className="mono">require approval</code> policies.
            Aegis notifies org admins by email, Slack, PagerDuty, or SMS (Settings,
            Governance). While waiting, the trace stays <strong>blocked</strong> for up to{" "}
            <strong>{ttlHours} hours</strong> — it does not fail early just because you
            stepped away. If the workflow errors elsewhere (n8n, CMS, timeout), the trace
            can fail immediately and the pending approval is closed. n8n stops waiting when
            expired, rejected, or the trace ends.
          </>
        }
      />

      <div className={ui.statStrip}>
        <span>
          <strong>{pending.length}</strong> pending
        </span>
        <span>
          <strong>{blockedTraces}</strong> blocked traces
        </span>
      </div>

      <div className={ui.toolbar} style={{ marginTop: "0.5rem" }}>
        <button
          type="button"
          className={`${ui.btn} ${tab === "pending" ? ui.btnPrimary : ui.btnSecondary}`}
          onClick={() => setTab("pending")}
        >
          Pending
        </button>
        <button
          type="button"
          className={`${ui.btn} ${tab === "history" ? ui.btnPrimary : ui.btnSecondary}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </div>

      {tab === "pending" ? (
        <>
          {pendingQuery.isLoading ? <LoadingBlock /> : null}
          {pendingQuery.error ? (
            <ErrorAlert message="Failed to load pending approvals." />
          ) : null}
          {isEmptyPending ? (
            <EmptyStatePanel
              mark={<AegisMark />}
              title="No pending approvals"
              description="When a policy requires approval, the trace blocks here until an operator approves or rejects. Admins receive email alerts when notifications are enabled."
              action={
                <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnSecondary}`}>
                  View traces
                </Link>
              }
            />
          ) : null}
          {pending.map((a) => (
            <ApprovalCard
              key={a.approval_id}
              approval={a}
              focusRef={a.approval_id === focusId ? focusRef : undefined}
              focused={a.approval_id === focusId}
              busy={actingId === a.approval_id}
              onApprove={() => approve.mutate(a.approval_id)}
              onReject={() => reject.mutate(a.approval_id)}
              onViewDetails={() => setDetailId(a.approval_id)}
            />
          ))}
        </>
      ) : (
        <>
          <div
            className={ui.toolbar}
            style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}
          >
            <select
              className={ui.select}
              value={historyDecision}
              onChange={(e) => {
                setHistoryDecision(
                  e.target.value as "all" | "approved" | "rejected" | "expired",
                );
                setHistoryPage(1);
              }}
              aria-label="Filter by decision"
            >
              <option value="all">All decisions</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
            <input
              className={ui.input}
              style={{ maxWidth: "16rem" }}
              placeholder="Filter by tool name…"
              value={historyToolDraft}
              onChange={(e) => setHistoryToolDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setHistoryTool(historyToolDraft);
                  setHistoryPage(1);
                }
              }}
            />
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => {
                setHistoryTool(historyToolDraft);
                setHistoryPage(1);
              }}
            >
              Apply filter
            </button>
          </div>
          {historyQuery.isLoading ? <LoadingBlock /> : null}
          {historyQuery.error ? (
            <ErrorAlert message="Failed to load approval history." />
          ) : null}
          {history.length === 0 && !historyQuery.isLoading ? (
            <EmptyStatePanel
              title="No approval history yet"
              description="Approved, rejected, and expired decisions appear here with who decided and when."
            />
          ) : null}
          {history.map((a) => (
            <ApprovalCard
              key={a.approval_id}
              approval={a}
              showDecided
              onViewDetails={() => setDetailId(a.approval_id)}
            />
          ))}
          {historyTotal > 0 ? (
            <ConsolePagination
              total={historyTotal}
              limit={historyLimit}
              page={historyPage}
              onPageChange={setHistoryPage}
              onLimitChange={(n) => {
                setHistoryLimit(n);
                setHistoryPage(1);
              }}
              noun="decision"
              pageSizes={[10, 25, 50, 100]}
            />
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(detailId)}
        title={detailApproval?.tool_name ?? "Approval details"}
        description="Review the signed policy gate event before deciding."
        wide
        closeOnOverlayClick={false}
        onClose={() => setDetailId(null)}
        footer={
          detailApproval?.status === "pending" ? (
            <>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setDetailId(null)}
              >
                Close
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnDanger}`}
                disabled={reject.isPending || approve.isPending}
                onClick={() => {
                  if (detailId) reject.mutate(detailId, { onSuccess: () => setDetailId(null) });
                }}
              >
                Reject
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={reject.isPending || approve.isPending}
                onClick={() => {
                  if (detailId) approve.mutate(detailId, { onSuccess: () => setDetailId(null) });
                }}
              >
                Approve
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setDetailId(null)}
            >
              Close
            </button>
          )
        }
      >
        {detailQuery.isLoading ? <LoadingBlock /> : null}
        {detailQuery.error ? <ErrorAlert message="Failed to load approval details." /> : null}
        {detailApproval ? (
          <>
            <div style={{ display: "grid", gap: "1rem" }}>
              {detailApproval.status !== "pending" && detailApproval.approver_email ? (
                <div
                  className={ui.card}
                  style={{
                    padding: "0.75rem 1rem",
                    background:
                      detailApproval.status === "approved"
                        ? "color-mix(in srgb, var(--console-success) 10%, transparent)"
                        : detailApproval.status === "rejected"
                          ? "color-mix(in srgb, var(--console-danger) 10%, transparent)"
                          : "var(--console-bg-subtle)",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {detailApproval.status === "approved"
                      ? "Approved by"
                      : detailApproval.status === "rejected"
                        ? "Rejected by"
                        : "Decided by"}{" "}
                    <span className="mono">{detailApproval.approver_email}</span>
                  </p>
                  {detailApproval.decided_at ? (
                    <p
                      style={{
                        margin: "0.25rem 0 0",
                        fontSize: "0.8125rem",
                        color: "var(--console-fg-muted)",
                      }}
                    >
                      {new Date(detailApproval.decided_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {detailApproval.policy_reason ? (
                <div className={ui.card} style={{ padding: "0.75rem 1rem" }}>
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--console-fg-subtle)" }}>
                    Policy reason
                  </p>
                  <p style={{ margin: "0.35rem 0 0" }}>{detailApproval.policy_reason}</p>
                </div>
              ) : null}

              {detailDiff.length > 0 ? (
                <div className={ui.card} style={{ padding: "0.75rem 1rem" }}>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600 }}>
                    Request fields (preview vs signed payload)
                  </p>
                  <table className={ui.table} style={{ fontSize: "0.8125rem" }}>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Preview</th>
                        <th>Signed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailDiff.map((row) => (
                        <tr key={row.key}>
                          <td className="mono">{row.key}</td>
                          <td>{row.preview ?? "n/a"}</td>
                          <td
                            style={
                              row.preview !== row.raw
                                ? { color: "var(--console-warning)" }
                                : undefined
                            }
                          >
                            {row.raw}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className={ui.card} style={{ padding: "0.75rem 1rem" }}>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600 }}>
                  Full signed event payload
                </p>
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    fontSize: "0.75rem",
                    maxHeight: "16rem",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(detailApproval.event_payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </ConsolePage>
  );
}
