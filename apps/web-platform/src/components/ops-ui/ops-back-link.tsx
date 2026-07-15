"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import ui from "./ui.module.css";

/** Back to list with pagination preserved, or browser history, or fallback. */
export function OpsBackLink({
  fallback,
  children,
}: {
  fallback: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onBack() {
    const returnTo = searchParams.get("return");
    if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
      router.push(returnTo);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  }

  return (
    <button type="button" className={ui.backLink} onClick={onBack}>
      {children}
    </button>
  );
}
