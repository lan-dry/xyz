"use client";

import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { idApi } from "@/lib/id-api";

const PUBLIC_PATHS = new Set([
  "/login",
  "/invite",
  "/forgot-password",
  "/reset-password",
]);

type MePayload = { user?: { email: string } };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MePayload>("/auth/me"),
    enabled: !isPublic,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (isPublic) return;
    if (meQuery.isPending) return;
    if (meQuery.isError || !meQuery.data?.user?.email) {
      router.replace(`/login?return=${encodeURIComponent(pathname || "/")}`);
    }
  }, [
    isPublic,
    meQuery.isPending,
    meQuery.isError,
    meQuery.data?.user?.email,
    pathname,
    router,
  ]);

  if (isPublic) {
    return children;
  }

  if (meQuery.isPending && !meQuery.data) {
    return (
      <p style={{ padding: "2rem", color: "#9aa3ad" }}>Checking sign-in…</p>
    );
  }

  if (meQuery.isError || !meQuery.data?.user?.email) {
    return (
      <p style={{ padding: "2rem", color: "#9aa3ad" }}>Redirecting to sign-in…</p>
    );
  }

  return children;
}
