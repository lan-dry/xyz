type Bucket = {
  attempts: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function consumeTotpAttempt(
  key: string,
  options: { maxAttempts?: number; windowMs?: number } = {},
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const maxAttempts = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 5 * 60 * 1000;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { attempts: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterMs: windowMs };
  }
  if (bucket.attempts >= maxAttempts) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  bucket.attempts += 1;
  return { allowed: true, remaining: maxAttempts - bucket.attempts, retryAfterMs: bucket.resetAt - now };
}

export function clearTotpAttemptBucket(key: string): void {
  buckets.delete(key);
}
