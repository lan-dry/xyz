"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { TRACE_PAGE_SIZES, useTraceListParams } from "@/hooks/use-trace-list-params";
import { consoleApi } from "@/lib/api";

type SearchHit = {
  event_id: string;
  trace_id: string;
  agent_id: string;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  emitted_at: string;
  rank: number;
};

type SearchResponse = {
  query: string;
  hits: SearchHit[];
  total: number;
  page: number;
  limit: number;
};

export default function SearchPage() {
  const { q, page, limit, setQuery, setPage, setLimit } = useTraceListParams(25);
  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (input !== q) setQuery(input);
    }, 300);
    return () => window.clearTimeout(t);
  }, [input, q, setQuery]);

  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  qs.set("page", String(page));
  qs.set("limit", String(limit));

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["console", "search", q, page, limit],
    queryFn: () => consoleApi<SearchResponse>(`/search?${qs.toString()}`),
    enabled: q.trim().length > 0,
  });

  const hasQuery = q.trim().length > 0;
  const noResults = hasQuery && data && data.total === 0 && !isLoading;

  return (
    <ConsolePage>
      <PageHeader
        title="Search"
        subtitle="Full-text search across your signed event ledger: trace IDs, agents, tools, policy decisions, and payload text."
      />

      <div className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>
            Query
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Search size={16} aria-hidden style={{ color: "var(--console-fg-subtle)" }} />
            <input
              type="search"
              className={ui.input}
              placeholder="deny, app.payments.transfer, trc_…, vendor@example.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </span>
        </label>
        <p className={ui.cardHint} style={{ margin: "0.75rem 0 0" }}>
          Matches event IDs, trace IDs, agent IDs, tool names, and JSON payload fields.
          Multi-word queries match all terms. Partial IDs work (e.g.{" "}
          <code className="mono">trc_72ad</code>).
        </p>
      </div>

      {!hasQuery ? (
        <p style={{ color: "var(--console-fg-subtle)", fontSize: "0.9375rem" }}>
          Enter a search term to query your event ledger.
        </p>
      ) : null}

      {hasQuery && data && data.total > 0 ? (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
          <strong>{data.total.toLocaleString()}</strong> result{data.total === 1 ? "" : "s"} for{" "}
          <code className="mono">{data.query}</code>
        </p>
      ) : null}

      {isLoading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Search failed." /> : null}

      {noResults ? (
        <EmptyStatePanel
          icon={Search}
          title={`No results for "${q.trim()}"`}
          description="Try a trace ID prefix, tool name, policy decision (deny, allow), or a value from the event payload."
          action={
            <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnSecondary}`}>
              Browse traces
            </Link>
          }
        />
      ) : null}

      {data && data.hits.length > 0 ? (
        <div className={ui.tableWrap} style={{ opacity: isFetching ? 0.65 : 1 }}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Event</th>
                <th>Trace</th>
                <th>Kind</th>
                <th>Policy</th>
                <th>Tool</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.hits.map((h) => (
                <tr key={h.event_id}>
                  <td>
                    <Link
                      href={`/aegis/events/${encodeURIComponent(h.event_id)}`}
                      className={`${ui.tableLink} mono`}
                    >
                      {h.event_id}
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={`/aegis/traces/${encodeURIComponent(h.trace_id)}`}
                      className={`${ui.tableLink} mono`}
                    >
                      {h.trace_id}
                    </Link>
                  </td>
                  <td>{h.action_kind}</td>
                  <td>
                    <StatusBadge status={h.policy_decision} />
                  </td>
                  <td className="mono">{h.tool_name ?? "-"}</td>
                  <td>{new Date(h.emitted_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ConsolePagination
            total={data.total}
            limit={limit}
            page={page}
            onPageChange={setPage}
            onLimitChange={(n) => setLimit(n as (typeof TRACE_PAGE_SIZES)[number])}
            noun="result"
          />
        </div>
      ) : null}
    </ConsolePage>
  );
}
