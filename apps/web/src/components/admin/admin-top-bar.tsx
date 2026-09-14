"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** Sticky utility bar above admin main content (sidebar layout unchanged). */
export function AdminTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-surface)]/95 px-6 backdrop-blur lg:px-10">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        Internal ops
      </span>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--admin-fg-subtle)] no-underline transition-colors duration-150 hover:text-[var(--admin-fg)]"
      >
        Salanor.com
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </Link>
    </header>
  );
}
