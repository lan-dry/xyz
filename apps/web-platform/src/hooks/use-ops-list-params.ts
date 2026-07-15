"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const OPS_PAGE_SIZES = [10, 25, 50, 100] as const;

export type OpsPageSize = (typeof OPS_PAGE_SIZES)[number];

export function useOpsListParams(defaultLimit: OpsPageSize = 25) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const limit = useMemo(() => {
    const raw = Number(searchParams.get("limit") ?? String(defaultLimit));
    return (OPS_PAGE_SIZES.includes(raw as OpsPageSize) ? raw : defaultLimit) as OpsPageSize;
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

  const setPage = useCallback(
    (nextPage: number) => {
      replaceParams({ page: String(Math.max(1, nextPage)) });
    },
    [replaceParams],
  );

  const setLimit = useCallback(
    (nextLimit: OpsPageSize) => {
      replaceParams({ limit: String(nextLimit), page: "1" });
    },
    [replaceParams],
  );

  return {
    q,
    limit,
    page,
    offset,
    setQuery,
    setPage,
    setLimit,
    replaceParams,
  };
}
