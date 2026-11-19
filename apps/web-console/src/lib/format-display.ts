/**
 * Bank-facing display helpers: Africa/Kigali 24h times (UTC on hover) and RWF amounts.
 */

const KIGALI = "Africa/Kigali";

/** `15-11-2026 14:32` in Africa/Kigali, 24-hour clock. */
export function formatKigali(iso: string | Date, withSeconds = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return typeof iso === "string" ? iso : "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KIGALI,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const time = `${get("hour")}:${get("minute")}${withSeconds ? `:${get("second")}` : ""}`;
  return `${get("day")}-${get("month")}-${get("year")} ${time}`;
}

export function formatUtc(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Always `DD-MM-YYYY HH:mm` (24-hour). Pair with `title={formatUtc(iso)}` / ConsoleTime
 * so UTC shows on hover.
 */
export function formatConsoleTime(iso: string | Date, withSeconds = false): string {
  return formatKigali(iso, withSeconds);
}

/** Date-only: always `DD-MM-YYYY`. */
export function formatConsoleDate(iso: string | Date): string {
  const full = formatKigali(iso, false);
  return full.split(" ")[0] ?? full;
}

/**
 * Start / end of a Kigali calendar day (`YYYY-MM-DD`) as UTC ISO strings, for the
 * date-range filter. Kigali is UTC+2 all year (no DST).
 */
export function kigaliDayBounds(day: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = new Date(`${day}T00:00:00+02:00`);
  const to = new Date(`${day}T23:59:59.999+02:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Amount with optional currency code (no default currency - pass pack/event currency). */
export function formatRwf(amount: number, currency?: string | null): string {
  const n = Math.round(amount).toLocaleString("en-US");
  const cur = currency?.trim() ? currency.trim().toUpperCase() : "";
  return cur ? `${cur} ${n}` : n;
}

/** Format any currency; never invents a default code. */
export function formatMoney(amount: number | null | undefined, currency?: string | null): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return formatRwf(amount, currency);
}
