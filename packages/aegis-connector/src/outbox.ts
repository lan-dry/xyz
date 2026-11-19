import type { SendEventResult, SignedEnvelope } from "@salanor/aegis-sdk";
import type { RetryConfig } from "./config.js";
import type { ConnectorState, DeliveredRecord } from "./state.js";

export interface SenderDeps {
  state: ConnectorState;
  /** Deliver one envelope. Must send exactly the envelope given (same idempotency key). */
  send: (envelope: SignedEnvelope) => Promise<SendEventResult>;
  /**
   * Re-read Aegis's last accepted seq for this source (GET .../last-seq).
   * Required to recover from seq_replay without reusing a sequence number.
   */
  fetchLastSeq: () => Promise<number>;
  retry: RetryConfig;
  now?: () => number;
  random?: () => number;
  /** Optional logger (defaults to console.error). */
  logError?: (message: string) => void;
}

export interface SenderStatus {
  connected: boolean;
  last_success_at: string | null;
  last_error: string | null;
  clock_skew_ms: number | null;
}

function envelopeRejectCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const rec = body as Record<string, unknown>;
  if (rec.error !== "envelope_rejected" || typeof rec.code !== "string") {
    return null;
  }
  return rec.code;
}

/**
 * Delivers the on-disk outbox to Aegis strictly in seq order, one envelope at a time.
 *
 *  - Single-flight: only one send is ever in progress, so an envelope is never sent
 *    concurrently with itself.
 *  - An envelope leaves the outbox only after Aegis accepted it (2xx). Real duplicates from
 *    Aegis also return 2xx with the stored response. HTTP 409 seq_replay / sequence conflict
 *    triggers a last-seq sync: local last_seq advances to the remote value and conflicting
 *    outbox envelopes are dropped (never reused). Other failures stay queued and retry the
 *    identical envelope (same idempotency key) with exponential backoff.
 *  - Non-retryable 4xx (bad bearer, validation) are retried too: nothing is dropped silently,
 *    and the head of the queue blocks later seqs so ordering is preserved. They show up in
 *    /health as last_error with a growing outbox.
 */
export class OutboxSender {
  private draining: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = false;
  private readonly waiters = new Map<string, Array<(record: DeliveredRecord) => void>>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly logError: (message: string) => void;

  readonly status: SenderStatus = {
    connected: false,
    last_success_at: null,
    last_error: null,
    clock_skew_ms: null,
  };

  constructor(private readonly deps: SenderDeps) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.logError = deps.logError ?? ((message) => console.error(message));
  }

  /** Start delivering now, unless a backoff timer is already pending. */
  kick(): void {
    if (this.stopped || this.timer || this.draining) {
      return;
    }
    this.draining = this.drain()
      .catch((err: unknown) => {
        this.attempts++;
        this.status.connected = false;
        this.status.last_error = err instanceof Error ? err.message : String(err);
        this.scheduleRetry();
      })
      .finally(() => {
        this.draining = null;
      });
  }

  /** Resolves when `key` has been delivered, or null after `ms`. */
  waitForDelivery(key: string, ms: number): Promise<DeliveredRecord | null> {
    const existing = this.deps.state.findByIdempotencyKey(key);
    if (existing?.state === "delivered") {
      return Promise.resolve(existing.record);
    }
    if (ms <= 0) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const done = (record: DeliveredRecord | null) => {
        clearTimeout(timeout);
        resolve(record);
      };
      const timeout = setTimeout(() => {
        const list = this.waiters.get(key) ?? [];
        this.waiters.set(
          key,
          list.filter((fn) => fn !== done),
        );
        resolve(null);
      }, ms);
      this.waiters.set(key, [...(this.waiters.get(key) ?? []), done]);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.draining;
  }

  private backoffMs(): number {
    const { initial_ms, max_ms, factor, jitter } = this.deps.retry;
    const base = Math.min(max_ms, initial_ms * factor ** Math.max(0, this.attempts - 1));
    const spread = base * jitter * (this.random() * 2 - 1);
    return Math.max(1, Math.round(base + spread));
  }

  private async handleSeqConflict(headSeq: number, code: string): Promise<void> {
    const { state, fetchLastSeq } = this.deps;
    const localBefore = state.lastSeq;
    const remote = await fetchLastSeq();
    const { last_seq, dropped } = await state.syncFromRemoteLastSeq(remote);

    if (localBefore < remote) {
      this.logError(
        `[aegis-connector] source ${state.sourceId}: another instance appears to own this source ` +
          `(local last_seq=${localBefore} behind remote last_seq=${remote} after ${code}). ` +
          `Advancing local sequence to ${last_seq}; dropped conflicting outbox seqs [${dropped.join(", ")}]. ` +
          `One source key must have a single sequence owner — stop the other instance or use a distinct source_id.`,
      );
    } else {
      this.logError(
        `[aegis-connector] source ${state.sourceId}: ${code} on seq ${headSeq}; ` +
          `synced last_seq to ${last_seq} (remote=${remote}), dropped [${dropped.join(", ")}]. ` +
          `Next envelope will use ${last_seq + 1}.`,
      );
    }

    this.attempts = 0;
    this.status.connected = false;
    this.status.last_error =
      localBefore < remote
        ? `seq ownership conflict: local last_seq ${localBefore} behind remote ${remote}; synced to ${last_seq}`
        : `${code}: synced last_seq to ${last_seq}; dropped [${dropped.join(", ")}]`;
  }

  private async drain(): Promise<void> {
    const { state, send } = this.deps;
    while (!this.stopped) {
      const head = state.listOutbox()[0];
      if (!head) {
        this.attempts = 0;
        return;
      }
      const result = await send(head.envelope);
      if (result.serverDate) {
        const server = Date.parse(result.serverDate);
        if (!Number.isNaN(server)) {
          this.status.clock_skew_ms = server - this.now();
        }
      }
      if (result.ok) {
        const record = await state.markDelivered(head.seq, result.status, result.body);
        this.attempts = 0;
        this.status.connected = true;
        this.status.last_success_at = new Date(this.now()).toISOString();
        this.status.last_error = null;
        const listeners = this.waiters.get(record.idempotency_key) ?? [];
        this.waiters.delete(record.idempotency_key);
        for (const notify of listeners) {
          notify(record);
        }
        continue;
      }

      const code = envelopeRejectCode(result.body);
      if (result.status === 409 && (code === "seq_replay" || code === "idempotency_conflict")) {
        await this.handleSeqConflict(head.seq, code ?? "conflict");
        // Conflicting head is gone (or last_seq advanced); keep draining without backoff.
        continue;
      }

      this.attempts++;
      this.status.connected = false;
      this.status.last_error =
        result.error ?? `HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 200)}`;
      this.scheduleRetry();
      return;
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick();
    }, this.backoffMs());
  }
}
