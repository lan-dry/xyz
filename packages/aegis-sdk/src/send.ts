import type { SignedEnvelope } from "./types.js";

export interface SendEventOptions {
  /** Full URL of the Aegis source-event ingest endpoint. */
  url: string;
  /** Ingest bearer key. */
  bearer: string;
  envelope: SignedEnvelope;
  /** Injectable fetch (defaults to global fetch). */
  fetch?: typeof fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface SendEventResult {
  /** True for 2xx. */
  ok: boolean;
  /** HTTP status, or 0 if no response was received. */
  status: number;
  /** Parsed JSON body (or { raw } / { error } when not JSON / on network failure). */
  body: unknown;
  /** Whether the same envelope may be re-sent later (network error, 408, 425, 429, 5xx). */
  retryable: boolean;
  /** Value of the response Date header, if any (for clock-skew estimates). */
  serverDate?: string;
  error?: string;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * POST a signed envelope to Aegis. The idempotency key is sent as the
 * Idempotency-Key header so retries of the same envelope are de-duplicated.
 * Never throws: network failures are reported as { status: 0, retryable: true }.
 */
export async function sendEvent(options: SendEventOptions): Promise<SendEventResult> {
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;
  try {
    const response = await doFetch(options.url, {
      method: "POST",
      headers: {
        ...options.headers,
        Authorization: `Bearer ${options.bearer}`,
        "Content-Type": "application/json",
        "Idempotency-Key": options.envelope.idempotency_key,
        "X-Aegis-Envelope": options.envelope.aegis_envelope,
      },
      body: JSON.stringify(options.envelope),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
      retryable: !response.ok && isRetryableStatus(response.status),
      serverDate: response.headers.get("date") ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: { error: message }, retryable: true, error: message };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
