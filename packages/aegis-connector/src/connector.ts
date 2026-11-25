import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  assertEventJson,
  buildEnvelope,
  eventHash,
  keyPairFromSeed,
  sendEvent,
  signEnvelope,
  type BusinessEvent,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import { confirmUrl, ingestUrl, lastSeqUrl, type ConnectorConfig } from "./config.js";
import { readPrivateKey } from "./keystore.js";
import { OutboxSender } from "./outbox.js";
import { ConnectorState, type DeliveredRecord } from "./state.js";

const MAX_BODY_BYTES = 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConnectorDeps {
  /** Injectable fetch used for calls to Aegis. */
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
}

export type SubmitResult =
  | {
      status: "delivered";
      seq: number;
      idempotency_key: string;
      event_hash: string;
      receipt: unknown;
      duplicate: boolean;
    }
  | {
      status: "queued";
      seq: number;
      idempotency_key: string;
      event_hash: string;
      duplicate: boolean;
    };

export class ConflictError extends Error {}

export interface Connector {
  readonly server: Server;
  readonly publicKeyB64: string;
  submit(event: BusinessEvent, idempotencyKey?: string): Promise<SubmitResult>;
  health(): Record<string, unknown>;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("body too large"), { status: 413 });
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function createConnector(
  config: ConnectorConfig,
  deps: ConnectorDeps = {},
): Promise<Connector> {
  const now = deps.now ?? Date.now;
  const seed = await readPrivateKey(config.private_key_path, config.private_key_passphrase);
  const pair = await keyPairFromSeed(seed);
  const state = await ConnectorState.open(config.state_dir, config.source_id);

  const url = ingestUrl(config);
  const doFetch = deps.fetch ?? fetch;

  async function fetchLastSeqInfo(): Promise<{ last_seq: number; tenant_kind?: string }> {
    const response = await doFetch(lastSeqUrl(config), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.ingest_bearer}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(config.request_timeout_ms),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      throw new Error(
        `Failed to read remote last_seq (HTTP ${response.status}): ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    const record =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const last = record.last_seq;
    if (typeof last !== "number" || !Number.isSafeInteger(last) || last < 0) {
      throw new Error(`Invalid last_seq response: ${JSON.stringify(body).slice(0, 200)}`);
    }
    const tenant_kind = typeof record.tenant_kind === "string" ? record.tenant_kind : undefined;
    return { last_seq: last, tenant_kind };
  }

  async function fetchLastSeq(): Promise<number> {
    return (await fetchLastSeqInfo()).last_seq;
  }

  /** One successful last-seq read. Later gaps stay ownership conflicts. */
  let demoCatchupDone = false;
  async function catchUpDemoSeq(): Promise<void> {
    if (!config.demo_seq_catchup || demoCatchupDone) return;
    let info: { last_seq: number; tenant_kind?: string };
    try {
      info = await fetchLastSeqInfo();
    } catch {
      return;
    }
    demoCatchupDone = true;
    if (info.tenant_kind !== "demo" && info.tenant_kind !== "sandbox") return;
    const local = state.lastSeq;
    if (local >= info.last_seq) return;
    await state.syncFromRemoteLastSeq(info.last_seq);
    console.log(
      `Synced local sequence to remote (was ${local}, now ${info.last_seq}). Continuing.`,
    );
  }

  await catchUpDemoSeq();

  const sender = new OutboxSender({
    state,
    retry: config.retry,
    now,
    random: deps.random,
    fetchLastSeq,
    send: (envelope: SignedEnvelope) =>
      sendEvent({
        url,
        bearer: config.ingest_bearer,
        envelope,
        fetch: deps.fetch,
        timeoutMs: config.request_timeout_ms,
      }),
  });
  const mutex = new Mutex();

  function asResult(
    envelope: { seq: number; idempotency_key: string; event_hash: string },
    record: DeliveredRecord | null,
    duplicate: boolean,
  ): SubmitResult {
    const base = {
      seq: envelope.seq,
      idempotency_key: envelope.idempotency_key,
      event_hash: envelope.event_hash,
      duplicate,
    };
    return record
      ? { status: "delivered", ...base, receipt: record.receipt }
      : { status: "queued", ...base };
  }

  async function submit(event: BusinessEvent, idempotencyKey?: string): Promise<SubmitResult> {
    // Mirror envelope.idempotency_key into the event before hashing (same as buildEnvelope).
    const idem =
      idempotencyKey ??
      (typeof event.idempotency_key === "string" ? event.idempotency_key : undefined);
    if (
      typeof event.idempotency_key === "string" &&
      idempotencyKey &&
      event.idempotency_key !== idempotencyKey
    ) {
      throw new ConflictError("envelope.idempotency_key must equal event.idempotency_key");
    }
    const normalized: BusinessEvent =
      idem !== undefined ? { ...event, idempotency_key: idem } : event;
    assertEventJson(normalized);
    const hash = eventHash(normalized);

    // seq assignment + signing + durable enqueue are serialised: a seq is never reused.
    const queued = await mutex.run(async () => {
      await catchUpDemoSeq();
      if (idem) {
        const existing = state.findByIdempotencyKey(idem);
        if (existing) {
          const stored = existing.state === "delivered" ? existing.record : existing.entry.envelope;
          if (stored.event_hash !== hash) {
            throw new ConflictError("Idempotency-Key was already used with a different event");
          }
          return { envelope: stored, duplicate: true };
        }
      }
      const unsigned = buildEnvelope({
        source_id: config.source_id,
        key_id: config.key_id,
        seq: state.lastSeq + 1,
        ts: new Date(now()),
        event: normalized,
        idempotency_key: idem,
      });
      const signed = await signEnvelope(unsigned, seed);
      await state.appendOutbox(signed);
      return { envelope: signed, duplicate: false };
    });

    sender.kick();
    const record = await sender.waitForDelivery(queued.envelope.idempotency_key, config.sync_wait_ms);
    return asResult(
      {
        seq: queued.envelope.seq,
        idempotency_key: queued.envelope.idempotency_key,
        event_hash: hash,
      },
      record,
      queued.duplicate,
    );
  }

  function health(): Record<string, unknown> {
    return {
      status: "ok",
      source_id: config.source_id,
      key_id: config.key_id,
      public_key_b64: pair.publicKeyB64,
      connected: sender.status.connected,
      outbox_size: state.outboxSize,
      last_seq: state.lastSeq,
      clock_skew_ms: sender.status.clock_skew_ms,
      last_success_at: sender.status.last_success_at,
      last_error: sender.status.last_error,
    };
  }

  function authorized(req: IncomingMessage): boolean {
    if (!config.local_auth_token) {
      return true;
    }
    const header = req.headers.authorization ?? "";
    return header.startsWith("Bearer ") && safeEqual(header.slice(7), config.local_auth_token);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const method = req.method ?? "GET";

    if (path === "/health") {
      if (method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
      return sendJson(res, 200, health());
    }

    if (path === "/events" || path === "/execute/confirm") {
      if (method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
      if (!authorized(req)) return sendJson(res, 401, { error: "unauthorized" });

      if (path === "/execute/confirm") {
        let body: unknown;
        try {
          body = JSON.parse((await readBody(req)).toString("utf8"));
        } catch (err) {
          const status = (err as { status?: number }).status === 413 ? 413 : 400;
          return sendJson(res, status, {
            error: status === 413 ? "payload_too_large" : "invalid_json",
          });
        }
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return sendJson(res, 400, {
            error: "invalid_body",
            detail: "body must be a JSON object",
          });
        }
        const payload = { ...(body as Record<string, unknown>) };
        // Prefer source-signing params so the executor claim is attributable.
        // Confirm envelopes are signature-checked only (not sequence-accepted),
        // so we use a dedicated confirm seq space that does not touch the outbox.
        if (
          payload.params &&
          typeof payload.params === "object" &&
          !Array.isArray(payload.params) &&
          !payload.source_envelope
        ) {
          try {
            const tokenId =
              payload.token &&
              typeof payload.token === "object" &&
              !Array.isArray(payload.token) &&
              typeof (payload.token as Record<string, unknown>).token_id === "string"
                ? String((payload.token as Record<string, unknown>).token_id)
                : null;
            const unsigned = buildEnvelope({
              source_id: config.source_id,
              key_id: config.key_id,
              // Large constant offset keeps confirm envelopes out of the event seq stream.
              seq: 900_000_000 + (Math.floor(now() / 1000) % 99_999_999),
              ts: new Date(now()),
              event: {
                type: "execution.confirm",
                token_id: tokenId,
                params: payload.params as BusinessEvent,
              },
            });
            payload.source_envelope = await signEnvelope(unsigned, seed);
          } catch (err) {
            return sendJson(res, 400, {
              error: "invalid_params",
              detail: err instanceof Error ? err.message : String(err),
            });
          }
        }
        try {
          const upstream = await doFetch(confirmUrl(config), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.ingest_bearer}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(config.request_timeout_ms),
          });
          const text = await upstream.text();
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            /* keep text */
          }
          return sendJson(res, upstream.status, parsed);
        } catch (err) {
          return sendJson(res, 502, {
            error: "aegis_unreachable",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }

      let event: unknown;
      try {
        event = JSON.parse((await readBody(req)).toString("utf8"));
      } catch (err) {
        const status = (err as { status?: number }).status === 413 ? 413 : 400;
        return sendJson(res, status, {
          error: status === 413 ? "payload_too_large" : "invalid_json",
        });
      }
      if (typeof event !== "object" || event === null || Array.isArray(event)) {
        return sendJson(res, 400, { error: "invalid_event", detail: "body must be a JSON object" });
      }
      const idemHeader = req.headers["idempotency-key"];
      if (idemHeader !== undefined && (typeof idemHeader !== "string" || !UUID_RE.test(idemHeader))) {
        return sendJson(res, 400, { error: "invalid_idempotency_key", detail: "must be a UUID" });
      }
      try {
        const result = await submit(event as BusinessEvent, idemHeader as string | undefined);
        return sendJson(res, result.status === "delivered" ? 200 : 202, result);
      } catch (err) {
        if (err instanceof ConflictError) {
          return sendJson(res, 422, { error: "idempotency_conflict", detail: err.message });
        }
        if (err instanceof TypeError) {
          return sendJson(res, 400, { error: "invalid_event", detail: err.message });
        }
        throw err;
      }
    }

    sendJson(res, 404, { error: "not_found" });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.error("[aegis-connector] unhandled error:", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "internal" });
      } else {
        res.end();
      }
    });
  });

  return {
    server,
    publicKeyB64: pair.publicKeyB64,
    submit,
    health,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.listen.port, config.listen.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      sender.kick(); // flush anything left in the outbox by a previous run
      const addr = server.address() as AddressInfo;
      return { host: addr.address, port: addr.port };
    },
    async close() {
      if (server.listening) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
      }
      await sender.stop();
      await state.close();
    },
  };
}
