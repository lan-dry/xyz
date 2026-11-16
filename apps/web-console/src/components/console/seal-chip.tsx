"use client";

import { sealDisplay } from "@/lib/case-row";
import type { CaseSealStatus } from "@/lib/types";

import { ui } from "./console-ui";

const TONE_CLASS = {
  ok: ui.badgeSuccess,
  warn: ui.badgeWarning,
  bad: ui.badgeDanger,
  muted: ui.badgeMuted,
} as const;

/** Seal state for a case. A pending witness is amber, never green. */
export function SealChip({ seal }: { seal: CaseSealStatus | undefined }) {
  const d = sealDisplay(seal);
  return <span className={`${ui.badge} ${TONE_CLASS[d.tone]}`}>{d.label}</span>;
}
