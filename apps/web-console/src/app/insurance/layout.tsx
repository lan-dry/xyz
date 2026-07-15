"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConsoleShell } from "@/components/console/console-shell";
import { LoadingBlock } from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";
import { INSURANCE_NAV } from "@/lib/insurance-nav";
import type { MeResponse } from "@/lib/types";

export default function InsuranceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  const logout = useMutation({
    mutationFn: () => idApi<{ ok: boolean }>("/auth/logout", { method: "POST" }),
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
    if (meQuery.isError) {
      router.replace(`/login?return=${encodeURIComponent(pathname)}`);
    }
  }, [meQuery.isError, pathname, router]);

  if (meQuery.isPending || !meQuery.data) {
    return (
      <div data-console-shell style={{ minHeight: "100vh", padding: "2rem" }}>
        <LoadingBlock />
      </div>
    );
  }

  return (
    <ConsoleShell
      product="insurance"
      navItems={INSURANCE_NAV}
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
