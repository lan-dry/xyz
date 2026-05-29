import type { ReactNode } from "react";

export function StatusChip({
  children,
  tone = "soft",
}: {
  children: ReactNode;
  tone?: "soft" | "positive" | "warning" | "critical";
}) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-900"
        : tone === "critical"
          ? "bg-red-100 text-red-800"
          : "bg-teal-soft/45 text-teal-deep";

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>{children}</span>;
}
