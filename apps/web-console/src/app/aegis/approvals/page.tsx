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
  OutcomeChip,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { ConsoleTime } from "@/components/console/console-time";
import { useCaseSummaries } from "@/hooks/use-case-summaries";
import { consoleApi } from "@/lib/api";
import {
  approverDisplay,
  productFromSummary,
  roleLabel,
  ruleLabels,
  titleFromSummary,
} from "@/lib/case-row";
import {
  readConsoleEnvironment,
  type ConsoleEnvironment,
} from "@/lib/console-environment";
import { formatApprover } from "@/lib/describe-decision";
import { formatMoney } from "@/lib/format-display";
import { idApi } from "@/lib/id-api";
import { toolActionPlain } from "@/lib/outcome-vocab";
import type { CaseSummary, MeResponse } from "@/lib/types";
import { isBankDemoProfile } from "@/lib/ui-profile";

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
  metadata?: Record<string, unknown> | null;
  vote_count?: number;
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

function fieldLabel(key: string): string {
  switch (key) {
    case "beneficiary":
      return "Beneficiary";
    case "customer_email":
      return "Customer";
    case "order_id":
    case "resource_id":
      return "Order";
    case "segment":
      return "Segment";
    case "account_type":
      return "Account";
    case "currency":
      return "Currency";
    case "merchant_id":
      return "Merchant";
    default:
      return key.replace(/_/g, " ");
  }
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

function metaRecord(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return metadata && typeof metadata === "object" ? metadata : {};
}

function approvalRequiredFields(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const m = metaRecord(metadata);
  return Array.isArray(m.required_fields)
    ? m.required_fields.filter((f): f is string => typeof f === "string")
    : [];
}

function isHardStopApproval(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const m = metaRecord(metadata);
  return m.hard_stop === true;
}

function ApprovalCard({
  approval: a,
  focusRef,
  focused,
  onApprove,
  onReject,
  onRelease,
  onAskMore,
  onReassign,
  onViewDetails,
  busy,
  showDecided,
  requiredApprovers,
  summary,
  signedIn,
}: {
  summary?: CaseSummary;
  /** Current console user, for the "You are signed in as…" line. */
  signedIn?: {
    email: string;
    display_name: string | null;
    bank_role: string | null;
  } | null;
  approval: ApprovalSummary;
  focusRef?: RefObject<HTMLDivElement | null>;
  focused?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRelease?: () => void;
  onAskMore?: () => void;
  onReassign?: () => void;
  onViewDetails?: () => void;
  busy?: boolean;
  showDecided?: boolean;
  requiredApprovers?: number;
}) {
  const preview = a.request_preview;
  const expiry = expiresLabel(a.expires_at);
  const hardStop = isHardStopApproval(a.metadata);
  const needsInfo =
    a.status === "needs_info" ||
    Boolean(
      a.metadata &&
        typeof a.metadata === "object" &&
        (a.metadata as { needs_info?: unknown }).needs_info,
    );
  const assignee =
    a.metadata && typeof a.metadata === "object"
      ? String((a.metadata as { assignee_email?: unknown }).assignee_email ?? "")
      : "";

  const title = titleFromSummary(summary) ?? toolActionPlain(a.tool_name);
  const amountText = formatMoney(summary?.amount, summary?.currency);
  const triggeringRuleLabel = summary ? (ruleLabels(summary)[0] ?? null) : null;
  const requesterLabel = summary?.requester ?? null;
  const requesterEmail = summary?.requester_email ?? null;
  const selfRequested =
    Boolean(signedIn && requesterEmail) &&
    signedIn!.email.toLowerCase() === requesterEmail!.toLowerCase();
  const signedInLabel =
    signedIn
      ? formatApprover(signedIn.display_name, signedIn.bank_role) ??
        signedIn.display_name ??
        signedIn.email
      : null;
  const decidedApprover =
    summary?.approvers?.find((v) =>
      ["approved", "rejected", "declined", "released"].includes(v.decision),
    ) ?? null;
  const titleId = `approval-title-${a.approval_id}`;

  return (
    <article
      ref={focusRef}
      className={ui.listCard}
      tabIndex={focused ? -1 : undefined}
      aria-labelledby={titleId}
      style={
        focused
          ? {
              outline: "2px solid var(--console-accent)",
              outlineOffset: "2px",
            }
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
        <div style={{ flex: "1 1 16rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <h2
              id={titleId}
              style={{ margin: 0, fontWeight: 600, fontSize: "1.05rem" }}
            >
              {title}
            </h2>
            {showDecided ? (
              <StatusBadge status={a.status} />
            ) : a.status === "pending" || a.status === "needs_info" ? (
              <OutcomeChip
                chip={
                  hardStop
                    ? "Hard stop"
                    : needsInfo
                      ? "Needs more info"
                      : isBankDemoProfile()
                        ? "Needs approval"
                        : "Ask a person"
                }
                kind="ask_person"
              />
            ) : (
              <StatusBadge status={a.status} />
            )}
          </div>
          {requiredApprovers && requiredApprovers > 1 && !showDecided ? (
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.8125rem",
                color: "var(--console-fg-subtle)",
              }}
            >
              Four-eyes: {a.vote_count ?? 0} of {requiredApprovers} approvals
            </p>
          ) : null}
          {assignee ? (
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.8125rem",
                color: "var(--console-fg-subtle)",
              }}
            >
              Reassigned to <span className="mono">{assignee}</span>
            </p>
          ) : null}
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

          {summary?.outcome ? (
            <div
              className={ui.card}
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem 1rem",
                background: "var(--console-bg-subtle, rgba(0,0,0,0.03))",
              }}
            >
              {amountText ? (
                <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "1.1rem" }}>
                  {amountText}
                </p>
              ) : null}
              <dl
                style={{
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "max-content 1fr",
                  gap: "0.2rem 0.75rem",
                  fontSize: "0.8125rem",
                }}
              >
                {productFromSummary(summary) ? (
                  <>
                    <dt style={{ color: "var(--console-fg-muted)" }}>Product</dt>
                    <dd style={{ margin: 0 }}>{productFromSummary(summary)}</dd>
                  </>
                ) : null}
                <dt style={{ color: "var(--console-fg-muted)" }}>Requested by</dt>
                <dd style={{ margin: 0 }}>{requesterLabel ?? "Not recorded"}</dd>
                <dt style={{ color: "var(--console-fg-muted)" }}>Triggering rule</dt>
                <dd style={{ margin: 0 }}>
                  {triggeringRuleLabel ?? "Not recorded"}
                </dd>
                <dt style={{ color: "var(--console-fg-muted)" }}>Required role</dt>
                <dd style={{ margin: 0 }}>{roleLabel(summary.required_role)}</dd>
                <dt style={{ color: "var(--console-fg-muted)" }}>Source of the data</dt>
                <dd
                  style={{ margin: 0 }}
                  title={summary.provenance?.headline ?? undefined}
                >
                  {summary.provenance
                    ? summary.provenance.source_line_short
                    : "Not labelled"}
                  <span style={{ color: "var(--console-fg-subtle)" }}>
                    {" "}
                    · not checked for accuracy
                  </span>
                </dd>
              </dl>
              {!showDecided && signedIn && signedInLabel ? (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  You are signed in as <strong>{signedInLabel}</strong>. This needs{" "}
                  <strong>{roleLabel(summary.required_role)}</strong>.
                  {selfRequested
                    ? " Separation of duties: you requested this case, so someone else has to decide it."
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {!summary?.outcome &&
            (preview.amount_usd != null ||
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
                  <span style={{ color: "var(--console-fg-muted)" }}>
                    {fieldLabel(f.key)}:
                  </span>{" "}
                  {f.value}
                </p>
              ))}
              {preview.amount_usd == null && preview.fields.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--console-fg-subtle)" }}>
                  Amount and merchant details were not attached to this request. Ask the
                  integration owner to include them on the next hold.
                </p>
              ) : null}
            </div>
          )}

          {showDecided && (decidedApprover || a.approver_email) ? (
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
                    ? "Declined by"
                    : "Decided by"}{" "}
                {decidedApprover
                  ? approverDisplay(decidedApprover)
                  : a.approver_email}
              </p>
              {a.decided_at ? (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  <ConsoleTime iso={a.decided_at} />
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
            <Link
              href={`/aegis/traces/${encodeURIComponent(a.trace_id)}`}
              className={ui.tableLink}
            >
              Open case
            </Link>
          </p>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.75rem",
              color: "var(--console-fg-subtle)",
            }}
          >
            Requested <ConsoleTime iso={a.created_at} />
            {expiry && !showDecided ? ` · ${expiry}` : null}
          </p>
          <details style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
            <summary style={{ cursor: "pointer", color: "var(--console-fg-subtle)" }}>
              Technical details
            </summary>
            <dl
              style={{
                margin: "0.5rem 0 0",
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                gap: "0.2rem 0.75rem",
                color: "var(--console-fg-muted)",
              }}
            >
              <dt>Decision ID</dt>
              <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
                {a.approval_id}
              </dd>
              <dt>Event</dt>
              <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
                {a.event_id}
              </dd>
              <dt>Case (trace)</dt>
              <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
                {a.trace_id}
              </dd>
            </dl>
            <p style={{ margin: "0.5rem 0 0" }}>
              <Link
                href={`/aegis/events/${encodeURIComponent(a.event_id)}`}
                className={ui.tableLink}
              >
                Signed receipt
              </Link>
              {" · "}
              <Link
                href={`/aegis/events/${encodeURIComponent(a.event_id)}#share-receipt-heading`}
                className={ui.tableLink}
              >
                Share receipt
              </Link>
            </p>
          </details>
        </div>
        {onApprove || onReject || onRelease ? (
          <div
            className={ui.formRow}
            style={{ alignSelf: "flex-start", flexWrap: "wrap" }}
          >
            {onViewDetails ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={onViewDetails}
                aria-label={`View details for ${title}`}
              >
                View details
              </button>
            ) : null}
            {onAskMore && !hardStop ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={onAskMore}
                disabled={busy}
                aria-label={`Ask more about ${title}`}
              >
                Ask more
              </button>
            ) : null}
            {onReassign && !hardStop ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={onReassign}
                disabled={busy}
                aria-label={`Reassign ${title}`}
              >
                Reassign
              </button>
            ) : null}
            {hardStop && onRelease ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={onRelease}
                disabled={busy}
                aria-label={`Release hard stop for ${title}`}
              >
                Release
              </button>
            ) : null}
            {!hardStop && onApprove ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={onApprove}
                disabled={busy}
                aria-label={`Approve ${title}`}
              >
                Approve
              </button>
            ) : null}
            {onReject ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnDanger}`}
                onClick={onReject}
                disabled={busy}
                aria-label={`Decline ${title}`}
              >
                Decline
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusRef = useRef<HTMLDivElement | null>(null);
  const [environment, setEnvironment] = useState<ConsoleEnvironment>("production");
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
  const [actionModal, setActionModal] = useState<{
    approvalId: string;
    kind: "approve" | "reject" | "release" | "ask_more" | "reassign";
  } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionReasonCode, setActionReasonCode] = useState("");
  const [actionCallbackVerified, setActionCallbackVerified] = useState(false);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });
  const consoleMeQuery = useQuery({
    queryKey: ["console", "me", "bank-roles"],
    queryFn: () =>
      consoleApi<{
        user: {
          email: string;
          display_name: string | null;
          bank_roles?: string[];
        };
      }>("/auth/me"),
  });
  const bankMode = isBankDemoProfile();
  const role = meQuery.data?.user?.role?.trim().toLowerCase();
  const canApprove =
    role === "admin" || role === "owner" || role === "approver";

  useEffect(() => {
    setEnvironment(readConsoleEnvironment());
    function onEnv(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "sandbox" || detail === "production") setEnvironment(detail);
    }
    window.addEventListener("salanor:console-environment", onEnv);
    return () => window.removeEventListener("salanor:console-environment", onEnv);
  }, []);

  const governanceQuery = useQuery({
    queryKey: ["console", "governance-settings"],
    queryFn: () =>
      consoleApi<{
        settings: { approval_ttl_hours: number; required_approvers?: number };
      }>("/governance/settings"),
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
    queryKey: ["console", "approvals", "pending", environment],
    queryFn: () =>
      consoleApi<{
        approvals: ApprovalSummary[];
        blocked_traces?: number;
        required_approvers?: number;
      }>(`/approvals?status=pending&environment=${environment}`),
  });

  const historyQuery = useQuery({
    queryKey: [
      "console",
      "approvals",
      "history",
      environment,
      historyPage,
      historyLimit,
      historyDecision,
      historyTool,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        status: "history",
        environment,
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
      focusRef.current.focus({ preventScroll: true });
    }
  }, [focusId, pendingQuery.data]);

  const resetActionForm = () => {
    setActionModal(null);
    setActionNote("");
    setActionReasonCode("");
    setActionCallbackVerified(false);
  };

  const approve = useMutation({
    mutationFn: ({
      approvalId,
      reason,
      reason_code,
      callback_verified,
    }: {
      approvalId: string;
      reason?: string;
      reason_code?: string;
      callback_verified?: boolean;
    }) => {
      const note = reason?.trim() || undefined;
      const code = reason_code?.trim() || undefined;
      return consoleApi<{ approval: ApprovalSummary; finalized?: boolean }>(
        `/approvals/${encodeURIComponent(approvalId)}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: note,
            comment: note,
            reason_code: code,
            ...(typeof callback_verified === "boolean"
              ? { callback_verified }
              : {}),
          }),
        },
      );
    },
    onMutate: ({ approvalId }) => {
      setActingId(approvalId);
    },
    onSuccess: (data, { approvalId }) => {
      resetActionForm();
      if (data.finalized !== false && data.approval?.status === "approved") {
        setDecidedIds((prev) => new Set(prev).add(approvalId));
      }
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
    onSettled: () => {
      setActingId(null);
    },
  });

  const release = useMutation({
    mutationFn: ({
      approvalId,
      reason,
      reason_code,
    }: {
      approvalId: string;
      reason?: string;
      reason_code: string;
    }) => {
      const note = reason?.trim() || undefined;
      return consoleApi<{ approval: ApprovalSummary; released?: boolean }>(
        `/approvals/${encodeURIComponent(approvalId)}/release`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: note,
            comment: note,
            reason_code: reason_code.trim(),
          }),
        },
      );
    },
    onMutate: ({ approvalId }) => {
      setActingId(approvalId);
    },
    onSuccess: (_data, { approvalId }) => {
      resetActionForm();
      setDecidedIds((prev) => new Set(prev).add(approvalId));
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
    onSettled: () => {
      setActingId(null);
    },
  });

  const reject = useMutation({
    mutationFn: ({
      approvalId,
      reason,
    }: {
      approvalId: string;
      reason: string;
    }) =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(approvalId)}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      ),
    onMutate: ({ approvalId }) => {
      setActingId(approvalId);
      setDecidedIds((prev) => new Set(prev).add(approvalId));
    },
    onSuccess: () => {
      resetActionForm();
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
    },
    onError: (_err, { approvalId }) => {
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

  const askMore = useMutation({
    mutationFn: ({ approvalId, note }: { approvalId: string; note: string }) =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(approvalId)}/ask-more`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),
    onSuccess: () => {
      resetActionForm();
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
    },
  });

  const reassign = useMutation({
    mutationFn: ({
      approvalId,
      assignee_email,
    }: {
      approvalId: string;
      assignee_email: string;
    }) =>
      consoleApi<{ approval: ApprovalSummary }>(
        `/approvals/${encodeURIComponent(approvalId)}/reassign`,
        {
          method: "POST",
          body: JSON.stringify({ assignee_email }),
        },
      ),
    onSuccess: () => {
      resetActionForm();
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
    },
  });

  const pending = (pendingQuery.data?.approvals ?? []).filter(
    (a) => !decidedIds.has(a.approval_id),
  );
  const modalApproval =
    actionModal == null
      ? null
      : (pending.find((a) => a.approval_id === actionModal.approvalId) ??
        (detailQuery.data?.approval?.approval_id === actionModal.approvalId
          ? detailQuery.data.approval
          : null));
  const modalRequired = approvalRequiredFields(modalApproval?.metadata);
  const modalNeedsReasonCode =
    actionModal?.kind === "release" || modalRequired.includes("reason_code");
  const modalNeedsComment =
    actionModal?.kind === "release" ||
    actionModal?.kind === "reject" ||
    actionModal?.kind === "ask_more" ||
    modalRequired.includes("comment");
  const modalNeedsCallback = modalRequired.includes("callback_verified");
  const openAction = (
    approvalId: string,
    kind: "approve" | "reject" | "release" | "ask_more" | "reassign",
  ) => {
    setActionNote("");
    setActionReasonCode("");
    setActionCallbackVerified(false);
    setActionModal({ approvalId, kind });
  };
  const history = historyQuery.data?.approvals ?? [];
  const summariesQuery = useCaseSummaries([
    ...pending.map((a) => a.trace_id),
    ...history.map((a) => a.trace_id),
    ...(detailId && detailQuery.data?.approval ? [detailQuery.data.approval.trace_id] : []),
  ]);
  const summaries = summariesQuery.data;
  const me = meQuery.data?.user;
  const consoleMe = consoleMeQuery.data?.user;
  const signedIn = me
    ? {
        email: me.email,
        display_name: me.display_name ?? consoleMe?.display_name ?? null,
        bank_role: consoleMe?.bank_roles?.[0] ?? null,
      }
    : null;
  const historyTotal = historyQuery.data?.total ?? 0;
  const blockedTraces = pendingQuery.data?.blocked_traces ?? pending.length;
  const isEmptyPending = pending.length === 0 && !pendingQuery.isLoading;
  const ttlHours = governanceQuery.data?.settings.approval_ttl_hours ?? 24;
  const requiredApprovers =
    governanceQuery.data?.settings.required_approvers ??
    pendingQuery.data?.required_approvers ??
    1;
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
            When a rule says <strong>{bankMode ? "Needs approval" : "Ask a person"}</strong>,
            cases waiting for a person appear here. You have up to{" "}
            <strong>{ttlHours} hours</strong> to Approve or Decline. Admins can get Slack or
            email notify under Settings → Governance.
          </>
        }
      />

      <div className={ui.statStrip}>
        <span>
          <strong>{pending.length}</strong> waiting
        </span>
        <span>
          <strong>{blockedTraces}</strong> cases on hold
        </span>
      </div>

      <div
        className={ui.toolbar}
        style={{ marginTop: "0.5rem" }}
        role="tablist"
        aria-label="Approval lists"
      >
        <button
          type="button"
          role="tab"
          id="approvals-tab-pending"
          aria-selected={tab === "pending"}
          aria-controls="approvals-panel-pending"
          tabIndex={tab === "pending" ? 0 : -1}
          className={`${ui.btn} ${tab === "pending" ? ui.btnPrimary : ui.btnSecondary}`}
          onClick={() => setTab("pending")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setTab("history");
            }
          }}
        >
          Pending
        </button>
        <button
          type="button"
          role="tab"
          id="approvals-tab-history"
          aria-selected={tab === "history"}
          aria-controls="approvals-panel-history"
          tabIndex={tab === "history" ? 0 : -1}
          className={`${ui.btn} ${tab === "history" ? ui.btnPrimary : ui.btnSecondary}`}
          onClick={() => setTab("history")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setTab("pending");
            }
          }}
        >
          History
        </button>
      </div>

      {tab === "pending" ? (
        <div
          role="tabpanel"
          id="approvals-panel-pending"
          aria-labelledby="approvals-tab-pending"
        >
          {!meQuery.isLoading && !canApprove && pending.length > 0 ? (
            <div className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem" }}>
              Pending approvals are read-only for your role. An organization admin or owner
              must approve or reject the action.
            </div>
          ) : null}
          {pendingQuery.isLoading ? <LoadingBlock /> : null}
          {pendingQuery.error ? (
            <ErrorAlert message="Failed to load pending approvals." />
          ) : null}
          {isEmptyPending ? (
            <EmptyStatePanel
              mark={<AegisMark />}
              title="No pending approvals"
              description={
                bankMode
                  ? "When a rule says a case needs approval, it waits here until an authorised approver approves or declines it. Admins receive email alerts when notifications are enabled."
                  : "When a policy requires approval, the trace blocks here until an operator approves or rejects. Admins receive email alerts when notifications are enabled."
              }
              action={
                <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnSecondary}`}>
                  View cases
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
              summary={summaries?.[a.trace_id]}
              signedIn={signedIn}
              busy={actingId === a.approval_id}
              requiredApprovers={requiredApprovers}
              onApprove={
                canApprove && !isHardStopApproval(a.metadata)
                  ? () => openAction(a.approval_id, "approve")
                  : undefined
              }
              onRelease={
                canApprove && isHardStopApproval(a.metadata)
                  ? () => openAction(a.approval_id, "release")
                  : undefined
              }
              onReject={
                canApprove
                  ? () => openAction(a.approval_id, "reject")
                  : undefined
              }
              onAskMore={
                canApprove && !isHardStopApproval(a.metadata)
                  ? () => openAction(a.approval_id, "ask_more")
                  : undefined
              }
              onReassign={
                canApprove && !isHardStopApproval(a.metadata)
                  ? () => openAction(a.approval_id, "reassign")
                  : undefined
              }
              onViewDetails={() => setDetailId(a.approval_id)}
            />
          ))}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="approvals-panel-history"
          aria-labelledby="approvals-tab-history"
        >
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
              <option value="rejected">Declined</option>
              <option value="expired">Expired</option>
            </select>
            <input
              className={ui.input}
              style={{ maxWidth: "16rem" }}
              placeholder="Filter by tool name…"
              value={historyToolDraft}
              onChange={(e) => setHistoryToolDraft(e.target.value)}
              aria-label="Filter by tool name"
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
              summary={summaries?.[a.trace_id]}
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
        </div>
      )}

      <Modal
        open={Boolean(detailId)}
        title={
          detailApproval
            ? (titleFromSummary(summaries?.[detailApproval.trace_id]) ??
              toolActionPlain(detailApproval.tool_name))
            : "Approval details"
        }
        description="Review what the AI tried to do before you decide."
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
                disabled={
                  reject.isPending || approve.isPending || release.isPending
                }
                onClick={() => {
                  if (!detailId) return;
                  setDetailId(null);
                  openAction(detailId, "reject");
                }}
              >
                Decline
              </button>
              {isHardStopApproval(detailApproval.metadata) ? (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  disabled={
                    reject.isPending || approve.isPending || release.isPending
                  }
                  onClick={() => {
                    if (!detailId) return;
                    setDetailId(null);
                    openAction(detailId, "release");
                  }}
                >
                  Release
                </button>
              ) : (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  disabled={
                    reject.isPending || approve.isPending || release.isPending
                  }
                  onClick={() => {
                    if (!detailId) return;
                    setDetailId(null);
                    openAction(detailId, "approve");
                  }}
                >
                  Approve
                </button>
              )}
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
              {detailApproval.status !== "pending" &&
              (detailApproval.approver_email ||
                (summaries?.[detailApproval.trace_id]?.approvers.length ?? 0) > 0) ? (
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
                        ? "Declined by"
                        : "Decided by"}{" "}
                    {(() => {
                      const vote = summaries?.[detailApproval.trace_id]?.approvers.find(
                        (v) =>
                          ["approved", "rejected", "declined", "released"].includes(
                            v.decision,
                          ),
                      );
                      return vote
                        ? approverDisplay(vote)
                        : detailApproval.approver_email;
                    })()}
                  </p>
                  {detailApproval.decided_at ? (
                    <p
                      style={{
                        margin: "0.25rem 0 0",
                        fontSize: "0.8125rem",
                        color: "var(--console-fg-muted)",
                      }}
                    >
                      <ConsoleTime iso={detailApproval.decided_at} />
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
                  Technical details: full signed event payload
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

      <Modal
        open={Boolean(actionModal)}
        onClose={resetActionForm}
        closeOnOverlayClick={false}
        title={
          actionModal?.kind === "approve"
            ? "Approve"
            : actionModal?.kind === "release"
              ? "Release hard stop"
              : actionModal?.kind === "reject"
                ? "Decline"
                : actionModal?.kind === "ask_more"
                  ? "Ask more"
                  : "Reassign"
        }
      >
        {actionModal ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {actionModal.kind === "release" ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  color: "var(--console-fg-subtle)",
                }}
              >
                This case is a hard stop. It cannot be approved. Only an
                authorised release with a reason code is accepted.
              </p>
            ) : null}
            {actionModal.kind === "reassign" ? (
              <label className={ui.field}>
                Assignee email (org Admin, Owner, or Approver)
                <input
                  className={ui.input}
                  type="email"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="colleague@your-org.com"
                  autoComplete="email"
                  aria-describedby="reassign-hint"
                />
              </label>
            ) : null}
            {actionModal.kind !== "reassign" && modalNeedsReasonCode ? (
              <label className={ui.field}>
                Reason code (required)
                <input
                  className={ui.input}
                  value={actionReasonCode}
                  onChange={(e) => setActionReasonCode(e.target.value)}
                  placeholder={
                    actionModal.kind === "release"
                      ? "FALSE_POSITIVE"
                      : "WITHIN_BAND"
                  }
                  autoComplete="off"
                  aria-required="true"
                />
              </label>
            ) : null}
            {actionModal.kind !== "reassign" ? (
              <label className={ui.field}>
                {actionModal.kind === "reject"
                  ? "Reason (required)"
                  : actionModal.kind === "ask_more"
                    ? "What do you need?"
                    : modalNeedsComment
                      ? "Comment (required)"
                      : "Comment (optional)"}
                <textarea
                  className={ui.input}
                  rows={3}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    actionModal.kind === "ask_more"
                      ? "Need order confirmation screenshot…"
                      : actionModal.kind === "release"
                        ? "Why this hard stop is being released…"
                        : "Why this decision?"
                  }
                />
              </label>
            ) : null}
            {actionModal.kind === "approve" && modalNeedsCallback ? (
              <label
                className={ui.field}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={actionCallbackVerified}
                  onChange={(e) => setActionCallbackVerified(e.target.checked)}
                  aria-required="true"
                />
                <span>Callback verified (beneficiary bank confirmed)</span>
              </label>
            ) : null}
            {actionModal.kind === "reassign" ? (
              <p
                id="reassign-hint"
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--console-fg-subtle)",
                }}
              >
                Must be an active member who can decide approvals. Outside emails
                are rejected.
              </p>
            ) : null}
            {(approve.error ||
              release.error ||
              reject.error ||
              askMore.error ||
              reassign.error) && (
              <ErrorAlert
                message={
                  (
                    (approve.error ||
                      release.error ||
                      reject.error ||
                      askMore.error ||
                      reassign.error) as Error
                  ).message
                }
              />
            )}
            <div className={ui.formRow}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={resetActionForm}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={
                  approve.isPending ||
                  release.isPending ||
                  reject.isPending ||
                  askMore.isPending ||
                  reassign.isPending ||
                  (modalNeedsReasonCode && !actionReasonCode.trim()) ||
                  ((actionModal.kind === "reject" ||
                    actionModal.kind === "ask_more" ||
                    actionModal.kind === "reassign" ||
                    (actionModal.kind !== "approve" && modalNeedsComment) ||
                    (actionModal.kind === "approve" &&
                      modalNeedsComment)) &&
                    !actionNote.trim()) ||
                  (actionModal.kind === "approve" &&
                    modalNeedsCallback &&
                    !actionCallbackVerified)
                }
                onClick={() => {
                  if (actionModal.kind === "approve") {
                    approve.mutate({
                      approvalId: actionModal.approvalId,
                      reason: actionNote.trim() || undefined,
                      reason_code: actionReasonCode.trim() || undefined,
                      callback_verified: modalNeedsCallback
                        ? actionCallbackVerified
                        : undefined,
                    });
                  } else if (actionModal.kind === "release") {
                    release.mutate({
                      approvalId: actionModal.approvalId,
                      reason: actionNote.trim() || undefined,
                      reason_code: actionReasonCode.trim(),
                    });
                  } else if (actionModal.kind === "reject") {
                    reject.mutate({
                      approvalId: actionModal.approvalId,
                      reason: actionNote.trim(),
                    });
                  } else if (actionModal.kind === "ask_more") {
                    askMore.mutate({
                      approvalId: actionModal.approvalId,
                      note: actionNote.trim(),
                    });
                  } else {
                    reassign.mutate({
                      approvalId: actionModal.approvalId,
                      assignee_email: actionNote.trim(),
                    });
                  }
                }}
              >
                {actionModal.kind === "release" ? "Release" : "Confirm"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </ConsolePage>
  );
}
