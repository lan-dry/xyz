"use client";

import { formatConsoleTime, formatUtc } from "@/lib/format-display";

/** Local (Kigali in bank_demo) time with UTC on hover. */
export function ConsoleTime({
  iso,
  seconds = false,
}: {
  iso: string | null | undefined;
  seconds?: boolean;
}) {
  if (!iso) return <>-</>;
  return (
    <time dateTime={iso} title={`UTC ${formatUtc(iso)}`}>
      {formatConsoleTime(iso, seconds)}
    </time>
  );
}
