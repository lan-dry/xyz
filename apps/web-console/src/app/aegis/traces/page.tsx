"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import {
  ConsolePage,
  ConsolePagination,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import {
  TRACE_PAGE_SIZES,
  TRACE_STATUSES,
  useTraceListParams,
} from "@/hooks/use-trace-list-params";
import { consoleApi } from "@/lib/api";
import type { TraceSummary } from "@/lib/types";

type TracesResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
};

export default function TracesPage() {
  const {
    q,
    agentId,
    status,
    page,
    limit,
    queryString,
    setQuery,
    setAgentId,
    setStatus,
    setPage,
    setLimit,
  } = useTraceListParams(25);
  const [searchInput, setSearchInput] = useState(q);
  const [agentInput, setAgentInput] = useState(agentId);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setAgentInput(agentId);
  }, [agentId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) setQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, setQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (agentInput !== agentId) setAgentId(agentInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [agentInput, agentId, setAgentId]);

  const path = `/traces?${queryString}`;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["console", "traces", queryString],
    queryFn: () => consoleApi<TracesResponse>(path),
    placeholderData: (prev) => prev,
  });

  const hasFilters = Boolean(q.trim() || agentId.trim() || status);
  const traces = data?.traces ?? [];
  const total = data?.total ?? 0;

  return (
    <ConsolePage>
      <PageHeader
        title="Traces"
        subtitle="Append-only agent workflows scoped to your organization. Open a trace to inspect the signed event chain."
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
              placeholder="Trace ID, agent, or tool…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </span>
        </label>
        <label style={{ flex: "1 1 10rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Agent ID</span>
          <input
            type="text"
            className={ui.input}
            placeholder="agent-dev-01"
            value={agentInput}
            onChange={(e) => setAgentInput(e.target.value)}
          />
        </label>
        <label style={{ flex: "0 1 10rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Status</span>
          <select
            className={ui.input}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {TRACE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load traces." /> : null}

      {traces.length === 0 && !isLoading && !error ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title={hasFilters ? "No traces match" : "No traces yet"}
          description={
            hasFilters
              ? "Try clearing filters or run the pilot agent to ingest signed events."
              : "Traces appear when your agents ingest signed APS-1 events. Create an API key, then run a demo ingest or connect the Aegis SDK."
          }
          action={
            hasFilters ? undefined : (
              <a href="/aegis/keys" className={`${ui.btn} ${ui.btnPrimary}`}>
                Create API key
              </a>
            )
          }
          secondary={
            hasFilters ? undefined : (
              <>
                Quick start: <code className="mono">pnpm demo:ingest</code> after setting{" "}
                <code className="mono">AEGIS_INGEST_DEV_KEY</code> in your{" "}
                <code className="mono">.env</code>.
              </>
            )
          }
        />
      ) : null}

      {traces.length > 0 || (data && total > 0) ? (
        <div className={ui.tableWrap} style={{ opacity: isFetching ? 0.65 : 1 }}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Trace ID</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Events</th>
                <th>Denied</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr key={t.trace_id}>
                  <td>
                    <Link
                      href={`/aegis/traces/${encodeURIComponent(t.trace_id)}`}
                      className={`${ui.tableLink} mono`}
                    >
                      {t.trace_id}
                    </Link>
                  </td>
                  <td className="mono">{t.agent_id}</td>
                  <td>
                    <StatusBadge status={t.status} />
                    {t.status === "blocked" ? (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.75rem",
                          color: "var(--console-warning)",
                        }}
                      >
                        awaiting approval
                      </span>
                    ) : null}
                  </td>
                  <td>{t.total_events}</td>
                  <td>{t.denied_events}</td>
                  <td>{new Date(t.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ConsolePagination
            total={total}
            limit={limit}
            page={page}
            onPageChange={setPage}
            onLimitChange={(n) => setLimit(n as (typeof TRACE_PAGE_SIZES)[number])}
          />
        </div>
      ) : null}
    </ConsolePage>
  );
}
