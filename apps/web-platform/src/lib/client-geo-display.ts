/** Browser-safe helpers (do not import @salanor/platform-auth in Client Components). */

export function formatAuditLocation(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return "—";
  const parts: string[] = [];
  for (const key of ["city", "region", "country"] as const) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  }
  const loc = parts.join(", ");
  const ip = metadata.ip;
  if (typeof ip === "string" && ip.trim()) {
    return loc ? `${loc} · ${ip.trim()}` : ip.trim();
  }
  return loc || "—";
}

export function formatCountryLabel(code: string): string {
  const c = code.trim().toUpperCase();
  if (!c || c === "??") return "Unknown";
  return c;
}
