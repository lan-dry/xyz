/** In-process API error counts for GET /metrics. Reset on process restart. */
let unhandled = 0;

/** Rolling 5xx counts for spike alerts (5-minute window). */
const WINDOW_MS = 5 * 60_000;
const recent5xx: number[] = [];

export function recordApiError(): void {
  unhandled += 1;
}

export function recordHttp5xx(now = Date.now()): void {
  recent5xx.push(now);
  prune5xx(now);
}

function prune5xx(now: number): void {
  const cutoff = now - WINDOW_MS;
  while (recent5xx.length > 0 && recent5xx[0]! < cutoff) {
    recent5xx.shift();
  }
}

export function http5xxInWindow(now = Date.now()): number {
  prune5xx(now);
  return recent5xx.length;
}

export function apiErrorCounters(): { unhandled: number; http_5xx_window: number } {
  return { unhandled, http_5xx_window: http5xxInWindow() };
}

export function resetApiErrorCountersForTests(): void {
  unhandled = 0;
  recent5xx.length = 0;
}

export function fiveXxSpikeThreshold(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.ALERT_5XX_SPIKE_THRESHOLD;
  if (!raw) return 25;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 25;
}
