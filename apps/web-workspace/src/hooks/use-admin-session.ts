"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSession, type SessionInfo } from "@/lib/stoa-client";

export const ADMIN_SESSION_QUERY_KEY = ["stoa", "session"] as const;

export function useAdminSession() {
  return useQuery<SessionInfo>({
    queryKey: ADMIN_SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
