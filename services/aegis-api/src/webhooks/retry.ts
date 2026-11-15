/**
 * Webhook delivery with exponential backoff retry.
 */
export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type RetryAttempt = {
  attempt: number;
  ok: boolean;
  status?: number;
  error?: string;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Delay for attempt index (0-based): base * 2^attempt, capped. */
export function backoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const raw = baseDelayMs * 2 ** Math.max(0, attempt);
  return Math.min(maxDelayMs, raw);
}

/**
 * Run an async deliverer with exponential backoff until success or maxAttempts.
 */
export async function withExponentialBackoff(
  deliver: () => Promise<{ ok: boolean; status?: number; error?: string }>,
  options: RetryOptions = {},
): Promise<{ ok: boolean; attempts: RetryAttempt[] }> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const sleep = options.sleep ?? defaultSleep;
  const attempts: RetryAttempt[] = [];

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await deliver();
      attempts.push({
        attempt: i + 1,
        ok: result.ok,
        status: result.status,
        error: result.error,
      });
      if (result.ok) {
        return { ok: true, attempts };
      }
    } catch (err) {
      attempts.push({
        attempt: i + 1,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (i < maxAttempts - 1) {
      await sleep(backoffDelayMs(i, baseDelayMs, maxDelayMs));
    }
  }
  return { ok: false, attempts };
}
