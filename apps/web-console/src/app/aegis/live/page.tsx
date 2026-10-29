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
  OutcomeChip,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { SidePanel } from "@/components/console/side-panel";
import {
  TRACE_PAGE_SIZES,
  TRACE_STATUSES,
  useTraceListParams,
} from "@/hooks/use-trace-list-params";
import { consoleApi } from "@/lib/api";
import { listSentenceFromTrace } from "@/lib/case-story";
import { readConsoleEnvironment } from "@/lib/console-environment";
import type { TraceSummary } from "@/lib/types";

type TracesResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
};

const SAVED_VIEWS_KEY = "salanor.console.live.saved-views";

type SavedView = { id: string; name: string; status: string; q: string };

export default function LiveFeedPage() {
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState(readConsoleEnvironment());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setAgentInput(agentId);
  }, [agentId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (raw) setSavedViews(JSON.parse(raw) as SavedView[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onEnv(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "sandbox" || detail === "production") {
        setEnvironment(detail);
      }
    }
    window.addEventListener("salanor:console-environment", onEnv);
    return () => window.removeEventListener("salanor:console-environment", onEnv);
  }, []);

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

  const path = `/traces?${queryString}&environment=${environment}`;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["console", "traces", "live", queryString, environment],
    queryFn: () => consoleApi<TracesResponse>(path),
    placeholderData: (prev) => prev,
    refetchInterval: 8_000,
  });

  const selected = (data?.traces ?? []).find((t) => t.trace_id === selectedId) ?? null;
  const selectedStory = selected ? listSentenceFromTrace(selected) : null;

  const hasFilters = Boolean(q.trim() || agentId.trim() || status);
  const traces = data?.traces ?? [];
  const total = data?.total ?? 0;

  function saveCurrentView() {
    const name = window.prompt("Name this view", status || q || "Live filter");
    if (!name?.trim()) return;
    const next: SavedView[] = [
      {
        id: `view_${Date.now().toString(36)}`,
        name: name.trim(),
        status,
        q,
      },
      ...savedViews,
    ].slice(0, 8);
    setSavedViews(next);
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Live feed"
        subtitle={
          <>
            Streaming cases for <strong>{environment}</strong>. Auto-refreshes every few
            seconds. Click a row for a receipt preview; open the case for the full story.
          </>
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
              placeholder="Case ID, agent, or tool…"
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
            placeholder="Filter by exact agent ID"
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
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={saveCurrentView}>
            Save view
          </button>
          {isFetching ? (
            <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Updating…</span>
          ) : null}
        </div>
        {savedViews.length > 0 ? (
          <div style={{ flex: "1 1 100%", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {savedViews.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`${ui.btn} ${ui.btnGhost}`}
                style={{ fontSize: "0.75rem" }}
                onClick={() => {
                  setQuery(v.q);
                  setSearchInput(v.q);
                  setStatus(v.status);
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load live feed." /> : null}

      {traces.length === 0 && !isLoading && !error ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title={hasFilters ? "No rows match" : "No activity yet"}
          description={
            hasFilters
              ? "Try clearing filters or switch environment."
              : "Live feed fills when agents ingest signed events in this environment."
          }
          action={
            hasFilters ? undefined : (
              <Link href="/aegis/get-started" className={`${ui.btn} ${ui.btnPrimary}`}>
                Get started
              </Link>
            )
          }
        />
      ) : null}

      {traces.length > 0 || (data && total > 0) ? (
        <div className={ui.tableWrap} style={{ opacity: isFetching ? 0.85 : 1 }}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>What happened</th>
                <th>Agent</th>
                <th>Outcome</th>
                <th>Steps</th>
                <th>Case ID</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => {
                const row = listSentenceFromTrace(t);
                return (
                  <tr
                    key={t.trace_id}
                    style={{
                      cursor: "pointer",
                      background:
                        selectedId === t.trace_id
                          ? "color-mix(in srgb, var(--console-accent) 12%, transparent)"
                          : undefined,
                    }}
                    onClick={() => setSelectedId(t.trace_id)}
                  >
                    <td>{new Date(t.started_at).toLocaleString()}</td>
                    <td style={{ fontWeight: 500 }}>{row.sentence}</td>
                    <td className="mono" style={{ fontSize: "0.8125rem" }}>
                      {t.agent_id}
                    </td>
                    <td>
                      <OutcomeChip chip={row.outcome.chip} kind={row.outcome.kind} />
                    </td>
                    <td>{t.total_events}</td>
                    <td className="mono" style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                      {t.trace_id.slice(0, 12)}…
                    </td>
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
            onLimitChange={(n) => setLimit(n as (typeof TRACE_PAGE_SIZES)[number])}
          />
        </div>
      ) : null}

      <SidePanel
        open={Boolean(selected)}
        title={selectedStory?.sentence ?? "Receipt"}
        subtitle={selected ? selected.trace_id : undefined}
        onClose={() => setSelectedId(null)}
      >
        {selected && selectedStory ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              <OutcomeChip chip={selectedStory.outcome.chip} kind={selectedStory.outcome.kind} />
            </p>
            <dl style={{ margin: 0, fontSize: "0.8125rem" }}>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Agent</dt>
              <dd className="mono" style={{ margin: "0 0 0.5rem" }}>
                {selected.agent_id}
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Started</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {new Date(selected.started_at).toLocaleString()}
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Steps</dt>
              <dd style={{ margin: 0 }}>{selected.total_events}</dd>
            </dl>
            <Link
              href={`/aegis/traces/${encodeURIComponent(selected.trace_id)}`}
              className={`${ui.btn} ${ui.btnPrimary}`}
            >
              Open full case
            </Link>
          </div>
        ) : null}
      </SidePanel>
    </ConsolePage>
  );
}
