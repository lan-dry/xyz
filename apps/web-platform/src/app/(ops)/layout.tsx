"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { LoadingBlock } from "@/components/ops-ui/ops-ui";
import { platformApi } from "@/lib/platform-api";

function OpsAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const sessionQuery = useQuery({
    queryKey: ["platform", "session"],
    queryFn: () => platformApi<{ staff: boolean; email: string }>("session"),
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.isError) {
      router.replace("/login");
    }
  }, [sessionQuery.isError, router]);

  if (sessionQuery.isPending) {
    return <LoadingBlock label="Loading Platform Ops…" />;
  }

  if (!sessionQuery.data) {
    return null;
  }

  return <>{children}</>;
}

export default function OpsAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingBlock label="Loading…" />}>
      <OpsAuthGate>{children}</OpsAuthGate>
    </Suspense>
  );
}
