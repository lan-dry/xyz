"use client";

import type { ReactNode } from "react";

import { OpsShell } from "@/components/ops-shell";
import { LoadingBlock } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";

export function ContentPageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { email, logout, isLoading } = usePlatformSession();

  if (isLoading) {
    return <LoadingBlock label="Loading Platform Ops…" />;
  }

  return (
    <OpsShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      staffEmail={email}
      onLogout={() => logout()}
    >
      {children}
    </OpsShell>
  );
}
