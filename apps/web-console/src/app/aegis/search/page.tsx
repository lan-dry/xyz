"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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

  return (
    <ConsolePage>
      <PageHeader
        title="Search"
        subtitle="Full-text search across signed events in your organization (trace id, agent, tool, payload)."
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
              placeholder="deny, stripe, customer_email, trc_…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: "100%" }}
            />
          </span>
        </label>
      </div>

      {!q.trim() ? (
        <p style={{ color: "var(--console-fg-subtle)", fontSize: "0.9375rem" }}>
          Enter a search term to query your event ledger.
        </p>
      ) : null}

      {isLoading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Search failed." /> : null}

      {data && q.trim() ? (
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
                  <td className="mono">{h.tool_name ?? "—"}</td>
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
