"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConsoleShell } from "@/components/console/console-shell";
import { LoadingBlock } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

import { idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

export default function AegisLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isLogin = pathname === "/aegis/login";

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    enabled: !isLogin,
    retry: false,
  });

  const logout = useMutation({
    mutationFn: async () => {
      await idApi<{ ok: boolean }>("/auth/logout", { method: "POST" });
      await consoleApi<{ ok: boolean }>("/auth/logout", { method: "POST" }).catch(
        () => ({ ok: true }),
      );
    },
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  const endImpersonation = useMutation({
    mutationFn: () => idApi<MeResponse>("/auth/impersonate/end", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      window.location.href = `${process.env.NEXT_PUBLIC_PLATFORM_URL ?? "http://localhost:3003"}/organizations`;
    },
  });

  useEffect(() => {
    if (isLogin) return;
    if (meQuery.isError) {
      router.replace(`/login?return=${encodeURIComponent(pathname)}`);
      return;
    }
    if (
      meQuery.data &&
      meQuery.data.account.email_verified === false &&
      !meQuery.data.account.platform_role &&
      !meQuery.data.account.platform_staff
    ) {
      router.replace(
        `/verify-email-sent?email=${encodeURIComponent(meQuery.data.account.email)}`,
      );
      return;
    }
    if (
      meQuery.data &&
      (meQuery.data.needs_onboarding || meQuery.data.organization.needs_onboarding) &&
      !meQuery.data.impersonation?.active
    ) {
      router.replace(`/onboarding?return=${encodeURIComponent(pathname)}`);
    }
  }, [isLogin, meQuery.isError, meQuery.data, pathname, router]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (meQuery.isPending || !meQuery.data) {
    return (
      <div data-console-shell style={{ minHeight: "100vh", padding: "2rem" }}>
        <LoadingBlock />
      </div>
    );
  }

  return (
    <ConsoleShell
      product="aegis"
      user={meQuery.data.user}
      platformStaff={
        meQuery.data.account.platform_role != null ||
        meQuery.data.account.platform_staff === true
      }
      impersonation={meQuery.data.impersonation ?? null}
      onEndImpersonation={() => endImpersonation.mutate()}
      organization={meQuery.data.organization}
      organizations={meQuery.data.organizations}
      onLogout={() => logout.mutate()}
    >
      {children}
    </ConsoleShell>
  );
}
