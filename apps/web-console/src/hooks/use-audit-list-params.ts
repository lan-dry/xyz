"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;
export type AuditPageSize = (typeof AUDIT_PAGE_SIZES)[number];

export function useAuditListParams(defaultLimit: AuditPageSize = 25) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const action = searchParams.get("action") ?? "";

  const limit = useMemo(() => {
    const raw = Number(searchParams.get("limit") ?? String(defaultLimit));
    return (AUDIT_PAGE_SIZES.includes(raw as AuditPageSize)
      ? raw
      : defaultLimit) as AuditPageSize;
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
      replaceParams({ q: nextQ.trim() || null, page: "1" });
    },
    [replaceParams],
  );

  const setAction = useCallback(
    (next: string) => {
      replaceParams({ action: next || null, page: "1" });
    },
    [replaceParams],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      replaceParams({ page: String(Math.max(1, nextPage)) });
    },
    [replaceParams],
  );

  const setLimit = useCallback(
    (nextLimit: AuditPageSize) => {
      replaceParams({ limit: String(nextLimit), page: "1" });
    },
    [replaceParams],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (action) params.set("action", action);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [q, action, page, limit]);

  return {
    q,
    action,
    page,
    limit,
    offset,
    queryString,
    setQuery,
    setAction,
    setPage,
    setLimit,
  };
}
