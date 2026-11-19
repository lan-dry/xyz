"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { ConsoleTime } from "@/components/console/console-time";
import { DateInput } from "@/components/console/date-input";
import { SealChip } from "@/components/console/seal-chip";
import { SidePanel } from "@/components/console/side-panel";
import { useCaseSummaries } from "@/hooks/use-case-summaries";
import {
  approversLabel,
  bankVocabChip,
  chipFromSummary,
  productFromSummary,
  ruleLabels,
  whatFromSummary,
} from "@/lib/case-row";
import { formatMoney, kigaliDayBounds } from "@/lib/format-display";
import { isBankDemoProfile } from "@/lib/ui-profile";
import { TRACE_PAGE_SIZES, useTraceListParams } from "@/hooks/use-trace-list-params";
import { consoleApi } from "@/lib/api";
import { agentLabel } from "@/lib/agent-label";
import { listSentenceFromTrace } from "@/lib/case-story";
import { readConsoleEnvironment } from "@/lib/console-environment";
import type { TraceSummary } from "@/lib/types";

type TracesResponse = {
  traces: TraceSummary[];
  total: number;
  page: number;
  limit: number;
};

/** Outcome filter options: the same words as the outcome chips. */
const OUTCOME_OPTIONS = [
  "Allowed",
  "Needs approval",
  "Approved",
  "Declined",
  "Stopped",
  "Recorded only",
  "Expired",
] as const;

/** What a case was: matches the "What" wording (event type first). */
const PRODUCT_OPTIONS = [
  "Loan disbursement",
  "Payment release",
  "Customer data access",
] as const;

/** Client-side filters work on the loaded page, so load the biggest page when they are on. */
const FILTER_PAGE_LIMIT = 100;

const labelStyle = { fontSize: "0.75rem", color: "var(--console-fg-subtle)" } as const;
const fieldStyle = { display: "flex", flexDirection: "column", gap: "0.35rem" } as const;

export type CaseListVariant = "live" | "cases";

/**
 * Shared cases table.
 * - live: streaming feed (auto-refresh)
 * - cases: browsable list (no auto-refresh); used by /aegis/traces
 */
export function CaseListView({ variant }: { variant: CaseListVariant }) {
  const isLive = variant === "live";
  const {
    q,
    page,
    limit,
    queryString,
    setQuery,
    setPage,
    setLimit,
    outcome,
    product,
    dateFrom,
    dateTo,
    setOutcome,
    setProduct,
    setDateRange,
    clearFilters,
  } = useTraceListParams(25);
  const [searchInput, setSearchInput] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState(readConsoleEnvironment());

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

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

  const clientFiltered = Boolean(outcome || product);

  const path = useMemo(() => {
    const params = new URLSearchParams(queryString);
    // The Live feed has no Agent ID / Status filters any more.
    params.delete("agent_id");
    params.delete("status");
    if (clientFiltered) {
      params.set("page", "1");
      params.set("limit", String(FILTER_PAGE_LIMIT));
    }
    const fromBounds = kigaliDayBounds(dateFrom);
    const toBounds = kigaliDayBounds(dateTo);
    if (fromBounds) params.set("from", fromBounds.from);
    if (toBounds) params.set("to", toBounds.to);
    params.set("environment", environment);
    return `/traces?${params.toString()}`;
  }, [queryString, clientFiltered, dateFrom, dateTo, environment]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["console", "traces", variant, path],
    queryFn: () => consoleApi<TracesResponse>(path),
    placeholderData: (prev) => prev,
    refetchInterval: isLive ? 8_000 : false,
  });

  const allTraces = data?.traces ?? [];
  const total = data?.total ?? 0;

  // Plain facts per case (amount, rules, approvers, seal). Best effort.
  const summariesQuery = useCaseSummaries(allTraces.map((t) => t.trace_id));
  const summaries = summariesQuery.data;
  const hasFillerRows = allTraces.some((t) => summaries?.[t.trace_id]?.demo_filler);
  const [showFiller, setShowFiller] = useState(false);
  const visible = showFiller
    ? allTraces
    : allTraces.filter((t) => !summaries?.[t.trace_id]?.demo_filler);
  const traces = visible.filter((t) => {
    if (!clientFiltered) return true;
    const s = summaries?.[t.trace_id];
    if (outcome) {
      const row = listSentenceFromTrace(t);
      const chip =
        chipFromSummary(s)?.chip ?? bankVocabChip(row.outcome.chip, row.outcome.kind).chip;
      if (chip !== outcome) return false;
    }
    if (product && productFromSummary(s) !== product) return false;
    return true;
  });

  const selected = allTraces.find((t) => t.trace_id === selectedId) ?? null;
  const selectedStory = selected ? listSentenceFromTrace(selected) : null;

  const hasFilters = Boolean(q.trim() || outcome || product || dateFrom || dateTo);
  const tableMode =
    isBankDemoProfile() ||
    allTraces.some((t) => Boolean(summaries?.[t.trace_id]?.case_id));
  const waitingForFacts = clientFiltered && summariesQuery.isLoading;

  return (
    <ConsolePage>
      <PageHeader
        title={isLive ? "Live feed" : "Cases"}
        subtitle={
          isLive ? (
            <>
              {isBankDemoProfile() ? (
                <>Cases as they happen in the demo environment.</>
              ) : (
                <>
                  Streaming cases for <strong>{environment}</strong>.
                </>
              )}{" "}
              Updates every few seconds. Click a row for a preview; open the case for the full
              story.
            </>
          ) : (
            <>
              Browse and search sealed cases
              {isBankDemoProfile() ? (
                <> in the demo environment</>
              ) : (
                <>
                  {" "}
                  for <strong>{environment}</strong>
                </>
              )}
              . Click a row for a preview; open the case for the full story.
            </>
          )
        }
      />

      <div
        className={`${ui.card} ${ui.cardPad}`}
        style={{ marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}
      >
        <label style={{ ...fieldStyle, flex: "1 1 14rem" }}>
          <span style={labelStyle}>Search</span>
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
        <label style={{ ...fieldStyle, flex: "0 1 11rem" }}>
          <span style={labelStyle}>Outcome</span>
          <select
            className={ui.input}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All outcomes</option>
            {OUTCOME_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: "0 1 12rem" }}>
          <span style={labelStyle}>Product</span>
          <select
            className={ui.input}
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">All products</option>
            {PRODUCT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: "0 1 9.5rem" }}>
          <span style={labelStyle}>From date</span>
          <DateInput
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateRange(e.target.value, dateTo)}
          />
        </label>
        <label style={{ ...fieldStyle, flex: "0 1 9.5rem" }}>
          <span style={labelStyle}>To date</span>
          <DateInput
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateRange(dateFrom, e.target.value)}
          />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
          {hasFilters ? (
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => {
                setSearchInput("");
                clearFilters();
              }}
            >
              Clear filters
            </button>
          ) : null}
          {isLive && isFetching ? (
            <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>Updating…</span>
          ) : null}
        </div>
        {hasFillerRows ? (
          <label
            style={{
              flex: "1 1 100%",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.8125rem",
            }}
          >
            <input
              type="checkbox"
              checked={showFiller}
              onChange={(e) => setShowFiller(e.target.checked)}
            />
            Show background demo cases (hidden by default)
          </label>
        ) : null}
      </div>

      {isLoading && !data ? <LoadingBlock /> : null}
      {error ? (
        <ErrorAlert
          message={isLive ? "Failed to load live feed." : "Failed to load cases."}
        />
      ) : null}

      {traces.length === 0 && !isLoading && !error && !waitingForFacts ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title={hasFilters ? "No rows match" : "Connect an agent or workflow"}
          description={
            hasFilters
              ? "Try clearing filters or switch environment."
              : "Once an agent runs a governed action, you will see plain-language cards here: what happened, whether it was allowed, and a link to the receipt."
          }
          action={
            hasFilters ? undefined : (
              <Link href="/aegis/agents" className={`${ui.btn} ${ui.btnPrimary}`}>
                Connect an agent
              </Link>
            )
          }
          secondary={
            hasFilters ? undefined : (
              <Link href="/aegis/get-started" className={`${ui.btn} ${ui.btnGhost}`}>
                Open get started
              </Link>
            )
          }
        />
      ) : null}

      {tableMode && traces.length > 0 ? (
        <div style={{ opacity: isFetching ? 0.85 : 1, display: "grid", gap: "0.75rem" }}>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Case</th>
                  <th>What</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Outcome</th>
                  <th>Rule</th>
                  <th>Approver</th>
                  <th>Seal</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((t) => {
                  const s = summaries?.[t.trace_id];
                  const row = listSentenceFromTrace(t);
                  const chip =
                    chipFromSummary(s) ?? bankVocabChip(row.outcome.chip, row.outcome.kind);
                  const amount = formatMoney(s?.amount, s?.currency);
                  const caseId = s?.case_id ?? t.trace_id;
                  const rules = ruleLabels(s);
                  return (
                    <tr
                      key={t.trace_id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedId(t.trace_id)}
                    >
                      <td style={{ whiteSpace: "nowrap" }}>
                        {/* trace.started_at is the case's own time (emitted_at), so
                            seeded history shows its real spread of days. */}
                        <ConsoleTime iso={t.started_at ?? s?.created_at} />
                      </td>
                      <td style={{ maxWidth: "11rem" }}>
                        <Link
                          href={`/aegis/traces/${encodeURIComponent(t.trace_id)}`}
                          className={`${ui.tableLink} mono`}
                          title={caseId}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            wordBreak: "keep-all",
                          }}
                        >
                          {caseId}
                        </Link>
                        {s?.demo_history ? (
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.75rem",
                              color: "var(--console-fg-muted)",
                            }}
                          >
                            Demo history
                          </span>
                        ) : null}
                      </td>
                      <td style={{ maxWidth: "28rem" }}>
                        {whatFromSummary(s) ?? row.sentence}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {amount ?? "-"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <OutcomeChip chip={chip.chip} kind={chip.kind} />
                      </td>
                      <td style={{ fontSize: "0.8125rem", maxWidth: "14rem" }}>
                        {rules.length > 0
                          ? rules.map((r) => (
                              <div key={r} className="mono" style={{ fontSize: "inherit" }}>
                                {r}
                              </div>
                            ))
                          : "-"}
                      </td>
                      <td style={{ fontSize: "0.8125rem" }}>{approversLabel(s)}</td>
                      <td>
                        <SealChip seal={s?.seal} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {clientFiltered ? (
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
              Showing {traces.length} matching case{traces.length === 1 ? "" : "s"} from the
              latest {allTraces.length}
              {total > allTraces.length ? ` of ${total}` : ""}. Narrow the date range to look
              further back.
            </p>
          ) : (
            <ConsolePagination
              total={total}
              limit={limit}
              page={page}
              onPageChange={setPage}
              onLimitChange={(n) => setLimit(n as (typeof TRACE_PAGE_SIZES)[number])}
            />
          )}
        </div>
      ) : null}

      {!tableMode && (traces.length > 0 || (data && total > 0 && !clientFiltered)) ? (
        <div style={{ opacity: isFetching ? 0.85 : 1, display: "grid", gap: "0.75rem" }}>
          {traces.map((t) => {
            const row = listSentenceFromTrace(t);
            const statusLabel = row.outcome.chip;
            return (
              <article
                key={t.trace_id}
                className={`${ui.card} ${ui.cardPad}`}
                style={{
                  cursor: "pointer",
                  borderColor:
                    selectedId === t.trace_id
                      ? "var(--console-accent)"
                      : undefined,
                }}
                onClick={() => setSelectedId(t.trace_id)}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: "1 1 16rem" }}>
                    <div style={{ marginBottom: "0.4rem" }}>
                      <OutcomeChip chip={statusLabel} kind={row.outcome.kind} />
                      <span
                        style={{
                          marginLeft: "0.65rem",
                          fontSize: "0.75rem",
                          color: "var(--console-fg-subtle)",
                        }}
                      >
                        <ConsoleTime iso={t.started_at} />
                      </span>
                    </div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9375rem" }}>
                      {row.sentence}
                    </p>
                    <p
                      style={{
                        margin: "0.35rem 0 0",
                        fontSize: "0.75rem",
                        color: "var(--console-fg-muted)",
                      }}
                    >
                      {agentLabel(t.agent_name, t.agent_id)} · {t.total_events}{" "}
                      step{t.total_events === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link
                    href={`/aegis/traces/${encodeURIComponent(t.trace_id)}`}
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View receipt
                  </Link>
                </div>
              </article>
            );
          })}
          {!clientFiltered ? (
            <ConsolePagination
              total={total}
              limit={limit}
              page={page}
              onPageChange={setPage}
              onLimitChange={(n) => setLimit(n as (typeof TRACE_PAGE_SIZES)[number])}
            />
          ) : null}
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
              <dd style={{ margin: "0 0 0.5rem" }}>
                {agentLabel(selected.agent_name, selected.agent_id)}
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Started</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                <ConsoleTime iso={selected.started_at} />
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Steps</dt>
              <dd style={{ margin: 0 }}>{selected.total_events}</dd>
            </dl>
            <Link
              href={`/aegis/traces/${encodeURIComponent(selected.trace_id)}`}
              className={`${ui.btn} ${ui.btnPrimary}`}
            >
              View receipt
            </Link>
          </div>
        ) : null}
      </SidePanel>
    </ConsolePage>
  );
}
