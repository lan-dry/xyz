export type ClientGeo = {
  country?: string;
  region?: string;
  city?: string;
};

/** Coarse location from edge headers (Vercel, Cloudflare). No IP database lookup. */
export function getClientGeoFromHeaders(headers: {
  get(name: string): string | null | undefined;
}): ClientGeo {
  const country =
    headers.get("cf-ipcountry")?.trim() ||
    headers.get("x-vercel-ip-country")?.trim() ||
    undefined;
  if (!country || country === "XX") {
    return {};
  }
  const region = headers.get("x-vercel-ip-country-region")?.trim() || undefined;
  const city = headers.get("x-vercel-ip-city")?.trim() || undefined;
  return { country, region, city };
}

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
