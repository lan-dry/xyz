"use client";

import { Search } from "lucide-react";
import Link from "next/link";
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
import { ConsoleTime } from "@/components/console/console-time";
import { AUDIT_PAGE_SIZES, useAuditListParams } from "@/hooks/use-audit-list-params";
import { TruncatedId } from "@/components/console/truncated-id";
import { consoleApi } from "@/lib/api";
import { formatAuditLocation } from "@/lib/audit-location";
import {
  auditActionLabel,
  auditCaseId,
  auditTraceId,
  BANK_HIDDEN_ACTIONS,
  describeAuditEntry,
} from "@/lib/describe-audit";
import { isBankDemoProfile } from "@/lib/ui-profile";

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

const AUDIT_PRESETS = [
  { label: "Sign-in success", action: "auth.login.success" },
  { label: "Member removed", action: "membership.suspended" },
  { label: "Member reactivated", action: "membership.reactivated" },
  { label: "Role changed", action: "membership.role_changed" },
  { label: "Invite sent", action: "invitation.created" },
  { label: "Invite accepted", action: "invitation.accepted" },
] as const;

/** bank_demo: chips about who touched a case record, not member admin. */
const BANK_PRESETS = [
  { label: "Receipt opened", action: "receipt.viewed" },
  { label: "Receipt verified", action: "receipt.verified" },
  { label: "Evidence downloaded", action: "evidence.downloaded" },
  { label: "Share link opened", action: "receipt.share_opened" },
  { label: "Rules activated", action: "policy.activated" },
  { label: "Sign-in success", action: "auth.login.success" },
] as const;

export default function AuditLogsPage() {
  const bank = isBankDemoProfile();
  const {
    q,
    action,
    caseId,
    page,
    limit,
    queryString,
    setQuery,
    setAction,
    setCaseId,
    setPage,
    setLimit,
  } = useAuditListParams(25);
  const [searchInput, setSearchInput] = useState(q);
  const [caseInput, setCaseInput] = useState(caseId);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setCaseInput(caseId);
  }, [caseId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) setQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, setQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (caseInput.trim() !== caseId.trim()) setCaseId(caseInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [caseInput, caseId, setCaseId]);

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
  const allActions = actionsQuery.data?.actions ?? [];
  const actions = bank ? allActions.filter((a) => !BANK_HIDDEN_ACTIONS.has(a)) : allActions;
  const presets = bank ? BANK_PRESETS : AUDIT_PRESETS;
  // Hide the Location column when no row on this page has one.
  const showLocation = !bank || logs.some((row) => formatAuditLocation(row.metadata) !== "-");
  const filtered = Boolean(action || caseId.trim() || q.trim());

  return (
    <ConsolePage>
      <PageHeader
        title={bank ? "Access log" : "Logs"}
        subtitle={
          bank
            ? "Who opened, verified or downloaded a case record, and who changed the rules. Filter by case to see everything that touched it."
            : "Human and admin actions in the console (sign-in, members, policies, keys, exports, approvals). Agent runtime activity lives under Traces and Search."
        }
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
              placeholder={bank ? "Person, case, what happened…" : "Action, resource, metadata…"}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </span>
        </label>
        {bank ? (
          <label style={{ flex: "0 1 12rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Case ID</span>
            <input
              type="search"
              className={ui.input}
              placeholder="e.g. CASE-1042"
              value={caseInput}
              onChange={(e) => setCaseInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        ) : null}
        <label style={{ flex: "0 1 14rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>
            {bank ? "What happened" : "Action"}
          </span>
          <select
            className={ui.input}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">{bank ? "Everything" : "All actions"}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {bank ? auditActionLabel(a) : a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {presets.map((preset) => (
          <button
            key={preset.label}
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
        {action || (bank && caseId.trim()) ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ fontSize: "0.8125rem", padding: "0.35rem 0.75rem" }}
            onClick={() => {
              setAction("");
              if (bank) setCaseId("");
            }}
          >
            Clear filter
          </button>
        ) : null}
        {bank ? null : (
          <Link href="/aegis/settings/members" className={ui.tableLink} style={{ alignSelf: "center", fontSize: "0.8125rem" }}>
            Manage members →
          </Link>
        )}
      </div>

      {logsQuery.isPending && !logsQuery.data ? <LoadingBlock /> : null}
      {logsQuery.error ? (
        <ErrorAlert message={bank ? "Failed to load the access log." : "Failed to load audit logs."} />
      ) : null}

      {!logsQuery.isPending && !logsQuery.error ? (
        <div className={ui.tableWrap} style={{ opacity: logsQuery.isFetching ? 0.65 : 1 }}>
          {logs.length === 0 ? (
            <div className={ui.cardPad}>
              <p className={ui.cardHint}>
                {bank
                  ? filtered
                    ? "Nothing in the access log matches. Clear the filter to see everything."
                    : "Nothing here yet. Opening a receipt, checking it or downloading evidence is recorded here."
                  : "No audit events match. Member invites, API keys, and agent changes appear here."}
              </p>
            </div>
          ) : (
            <>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>{bank ? "What happened" : "Action"}</th>
                    <th>{bank ? "Case" : "Resource"}</th>
                    <th>{bank ? "Who" : "Actor"}</th>
                    {showLocation ? <th>Location</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => {
                    const location = formatAuditLocation(row.metadata);
                    const rowCase = auditCaseId(row);
                    const trace = auditTraceId(row);
                    return (
                      <tr key={row.audit_id}>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>
                          {bank ? (
                            <ConsoleTime iso={row.created_at} seconds />
                          ) : (
                            new Date(row.created_at).toLocaleString()
                          )}
                        </td>
                        <td>{bank ? describeAuditEntry(row) : row.action}</td>
                        <td>
                          {bank ? (
                            rowCase ? (
                              trace ? (
                                <Link href={`/aegis/traces/${encodeURIComponent(trace)}`} className={ui.tableLink}>
                                  {rowCase}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  className={ui.tableLink}
                                  onClick={() => setCaseId(rowCase)}
                                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                  title="Show only this case"
                                >
                                  {rowCase}
                                </button>
                              )
                            ) : (
                              "-"
                            )
                          ) : (
                            <>
                              <span>{row.resource_type}</span>
                              {row.resource_id ? (
                                <div style={{ marginTop: "0.2rem" }}>
                                  <TruncatedId value={row.resource_id} />
                                </div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td>{row.actor_email ??
                          (bank
                            ? row.action === "receipt.share_opened"
                              ? "Someone with a share link"
                              : "System"
                            : "-")}</td>
                        {showLocation ? (
                          <td style={{ fontSize: "0.8125rem", maxWidth: "14rem" }}>
                            {bank && location === "-" ? "" : location}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ConsolePagination
                total={total}
                limit={limit}
                page={page}
                onPageChange={setPage}
                onLimitChange={(n) => setLimit(n as (typeof AUDIT_PAGE_SIZES)[number])}
                noun="entry"
                nounPlural="entries"
                pageSizes={AUDIT_PAGE_SIZES}
              />
            </>
          )}
        </div>
      ) : null}
    </ConsolePage>
  );
}
