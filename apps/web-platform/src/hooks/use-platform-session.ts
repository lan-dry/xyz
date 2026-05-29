"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { canPlatform, type PlatformPermission, type PlatformRole } from "@/lib/platform-permissions";
import { idApi } from "@/lib/id-api";
import { platformApi } from "@/lib/platform-api";

export type PlatformSession = {
  staff: boolean;
  email: string;
  display_name: string | null;
  account_id: string;
  platform_role: PlatformRole;
};

export function usePlatformSession() {
  const router = useRouter();
  const sessionQuery = useQuery({
    queryKey: ["platform", "session"],
    queryFn: () => platformApi<PlatformSession>("session"),
  });

  const logout = useMutation({
    mutationFn: () => idApi<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    onSuccess: () => router.replace("/login"),
  });

  const role = sessionQuery.data?.platform_role ?? null;

  return {
    email: sessionQuery.data?.email ?? "",
    accountId: sessionQuery.data?.account_id ?? "",
    platformRole: role,
    can: (permission: PlatformPermission) => canPlatform(role, permission),
    logout: () => logout.mutate(),
    isLoading: sessionQuery.isLoading,
  };
}
