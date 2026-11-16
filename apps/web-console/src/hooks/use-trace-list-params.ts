"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const TRACE_STATUSES = [
  "running",
  "executing",
  "completed",
  "failed",
  "blocked",
] as const;

export const TRACE_PAGE_SIZES = [10, 25, 50, 100] as const;

export type TracePageSize = (typeof TRACE_PAGE_SIZES)[number];

export function useTraceListParams(defaultLimit: TracePageSize = 25) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const agentId = searchParams.get("agent_id") ?? "";
  const status = searchParams.get("status") ?? "";
  // Live feed filters: outcome / product are applied to the loaded page, the date
  // range (Kigali calendar days, YYYY-MM-DD) is sent to the API as from / to.
  const outcome = searchParams.get("outcome") ?? "";
  const product = searchParams.get("product") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  const limit = useMemo(() => {
    const raw = Number(searchParams.get("limit") ?? String(defaultLimit));
    return (TRACE_PAGE_SIZES.includes(raw as TracePageSize)
      ? raw
      : defaultLimit) as TracePageSize;
  }, [searchParams, defaultLimit]);

  const page = useMemo(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }, [searchParams]);

  const offset = (page - 1) * limit;

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setQuery = useCallback(
    (nextQ: string) => {
      replaceParams({
        q: nextQ.trim() || null,
        page: "1",
      });
    },
    [replaceParams],
  );

  const setAgentId = useCallback(
    (next: string) => {
      replaceParams({
        agent_id: next.trim() || null,
        page: "1",
      });
    },
    [replaceParams],
  );

  const setStatus = useCallback(
    (next: string) => {
      replaceParams({
        status: next || null,
        page: "1",
      });
    },
    [replaceParams],
  );

  const setOutcome = useCallback(
    (next: string) => replaceParams({ outcome: next || null, page: "1" }),
    [replaceParams],
  );

  const setProduct = useCallback(
    (next: string) => replaceParams({ product: next || null, page: "1" }),
    [replaceParams],
  );

  const setDateRange = useCallback(
    (from: string, to: string) =>
      replaceParams({ date_from: from || null, date_to: to || null, page: "1" }),
    [replaceParams],
  );

  const clearFilters = useCallback(
    () =>
      replaceParams({
        q: null,
        agent_id: null,
        status: null,
        outcome: null,
        product: null,
        date_from: null,
        date_to: null,
        page: "1",
      }),
    [replaceParams],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      replaceParams({ page: String(Math.max(1, nextPage)) });
    },
    [replaceParams],
  );

  const setLimit = useCallback(
    (nextLimit: TracePageSize) => {
      replaceParams({ limit: String(nextLimit), page: "1" });
    },
    [replaceParams],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (agentId.trim()) params.set("agent_id", agentId.trim());
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [q, agentId, status, page, limit]);

  return {
    q,
    agentId,
    status,
    page,
    limit,
    offset,
    queryString,
    setQuery,
    setAgentId,
    setStatus,
    setPage,
    setLimit,
    replaceParams,
    outcome,
    product,
    dateFrom,
    dateTo,
    setOutcome,
    setProduct,
    setDateRange,
    clearFilters,
  };
}
