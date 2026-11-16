"use client";

import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/api";
import type { CaseSummary } from "@/lib/types";

/** Plain facts (amount, rules, approvers, seal) for a page of cases. Best effort. */
export function useCaseSummaries(traceIds: string[]) {
  const ids = [...new Set(traceIds.filter(Boolean))].slice(0, 100).sort();
  return useQuery({
    queryKey: ["console", "cases", "summary", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 10_000,
    queryFn: async () => {
      const res = await consoleApi<{ cases: Record<string, CaseSummary> }>(
        `/cases/summary?trace_ids=${encodeURIComponent(ids.join(","))}`,
      );
      return res.cases;
    },
  });
}
