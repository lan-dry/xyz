export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** In-memory sliding window (single API instance). */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (existing.count >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  existing.count += 1;
  return { ok: true };
}

export function getClientIp(headers: {
  get(name: string): string | null | undefined;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      code: "rate_limited",
      message: `You have hit a rate limit. Wait about ${retryAfterSec} seconds, then try again.`,
      retry_after_sec: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

export function ingestRateLimitKey(ip: string): string {
  return `ingest:${ip}`;
}

/** Per-tenant ingest quota (events per minute). */
export function orgIngestRateLimitKey(organizationId: string): string {
  return `ingest:org:${organizationId}`;
}

export function exportRateLimitKey(organizationId: string): string {
  return `export:org:${organizationId}`;
}

export function signupRateLimitKey(ip: string): string {
  return `signup:ip:${ip}`;
}

export function loginRateLimitKey(ip: string): string {
  return `login:${ip}`;
}

export function oauthRateLimitKey(ip: string): string {
  return `oauth:${ip}`;
}

/** Max JSON body size for ingest (bytes). Default 256 KiB. */
export function maxIngestBodyBytes(): number {
  return readRateLimitEnv("INGEST_MAX_BODY_BYTES", 256 * 1024);
}

export function readRateLimitEnv(
  name: string,
  fallback: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
