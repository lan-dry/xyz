import { describe, expect, it, vi } from "vitest";
import {
  backoffDelayMs,
  withExponentialBackoff,
} from "../src/webhooks/retry.js";

describe("webhook exponential backoff", () => {
  it("doubles delay until max", () => {
    expect(backoffDelayMs(0, 100, 10_000)).toBe(100);
    expect(backoffDelayMs(1, 100, 10_000)).toBe(200);
    expect(backoffDelayMs(2, 100, 10_000)).toBe(400);
    expect(backoffDelayMs(10, 100, 500)).toBe(500);
  });

  it("retries until success", async () => {
    let n = 0;
    const sleep = vi.fn(async () => undefined);
    const result = await withExponentialBackoff(
      async () => {
        n += 1;
        return n >= 3 ? { ok: true, status: 200 } : { ok: false, status: 503 };
      },
      { maxAttempts: 5, baseDelayMs: 1, sleep },
    );
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("exhausts attempts on persistent failure", async () => {
    const sleep = vi.fn(async () => undefined);
    const result = await withExponentialBackoff(
      async () => ({ ok: false, status: 500, error: "fail" }),
      { maxAttempts: 3, baseDelayMs: 1, sleep },
    );
    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(3);
  });
});
