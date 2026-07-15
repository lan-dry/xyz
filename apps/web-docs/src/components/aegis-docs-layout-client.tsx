"use client";

import { usePathname } from "next/navigation";

import { DocsShell } from "@/components/docs-shell";

export function AegisDocsLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <DocsShell pathname={pathname}>{children}</DocsShell>;
}
