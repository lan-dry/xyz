"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import {
  ConsolePage,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";

/**
 * In-console entry for Verify. Public share links stay on /verify;
 * sidebar "Verify" lands here so operators never hit a dead nav item.
 */
function VerifyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/verify?${qs}` : "/verify");
  }, [router, searchParams]);

  return (
    <ConsolePage>
      <PageHeader
        title="Verify"
        subtitle="Opening the public seal checker…"
      />
      <LoadingBlock label="Opening Verify…" />
      <p style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
        If nothing happens, open{" "}
        <Link href="/verify" className={ui.tableLink}>
          /verify
        </Link>{" "}
        directly.
      </p>
    </ConsolePage>
  );
}

export default function AegisVerifyPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Opening Verify…" />}>
      <VerifyRedirect />
    </Suspense>
  );
}
