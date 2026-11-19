import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, type SignedEnvelope } from "@salanor/aegis-sdk";
import { parseConfig, type ConnectorConfig } from "../src/config.js";
import { createConnector, type Connector } from "../src/connector.js";
import { writePrivateKey } from "../src/keystore.js";

export interface FakeAegis {
  fetch: typeof fetch;
  /** Every request received, including failed ones. */
  attempts: Array<{ envelope: SignedEnvelope; headers: Record<string, string> }>;
  /** Envelopes accepted (2xx). */
  accepted: SignedEnvelope[];
  /** Confirm bodies forwarded to /executions/confirm. */
  confirms: Array<{ body: Record<string, unknown>; headers: Record<string, string> }>;
  /** Last accepted seq per source_id (seq accounting). */
  lastSeqBySource: Map<string, number>;
  mode: "ok" | "down" | "error500" | "unauthorized" | "seq_gate";
}

export function fakeAegis(): FakeAegis {
  const fake: FakeAegis = {
    attempts: [],
    accepted: [],
    confirms: [],
    lastSeqBySource: new Map(),
    mode: "ok",
    fetch: (async (url: string, init?: RequestInit) => {
      const urlText = String(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && /\/sources\/[^/]+\/last-seq/.test(urlText)) {
        if (fake.mode === "down") {
          throw new Error("ECONNREFUSED");
        }
        const match = urlText.match(/\/sources\/([^/]+)\/last-seq/);
        const sourceId = match ? decodeURIComponent(match[1]!) : "";
        return new Response(
          JSON.stringify({
            source_id: sourceId,
            last_seq: fake.lastSeqBySource.get(sourceId) ?? 0,
            status: "active",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (urlText.includes("/executions/confirm") || urlText.includes("/execute/confirm")) {
        const body = JSON.parse(init!.body as string) as Record<string, unknown>;
        fake.confirms.push({ body, headers });
        if (fake.mode === "down") {
          throw new Error("ECONNREFUSED");
        }
        return new Response(
          JSON.stringify({ ok: true, code: "matched", echoed: body }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const envelope = JSON.parse(init!.body as string) as SignedEnvelope;
      fake.attempts.push({ envelope, headers });
      if (fake.mode === "down") {
        throw new Error("ECONNREFUSED");
      }
      if (fake.mode === "error500") {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      if (fake.mode === "unauthorized") {
        return new Response(JSON.stringify({ error: "bad key" }), { status: 401 });
      }

      if (fake.mode === "seq_gate") {
        const last = fake.lastSeqBySource.get(envelope.source_id) ?? 0;
        if (envelope.seq <= last) {
          return new Response(
            JSON.stringify({
              error: "envelope_rejected",
              code: "seq_replay",
              message: `seq ${envelope.seq} <= last_seq ${last}`,
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          );
        }
        fake.lastSeqBySource.set(envelope.source_id, envelope.seq);
        fake.accepted.push(envelope);
        return new Response(JSON.stringify({ receipt_id: `rcpt_${envelope.seq}`, seq: envelope.seq }), {
          status: 200,
          headers: { date: new Date().toUTCString() },
        });
      }

      const duplicate = fake.accepted.some((e) => e.idempotency_key === envelope.idempotency_key);
      if (!duplicate) {
        fake.accepted.push(envelope);
        const prev = fake.lastSeqBySource.get(envelope.source_id) ?? 0;
        fake.lastSeqBySource.set(envelope.source_id, Math.max(prev, envelope.seq));
      }
      return new Response(JSON.stringify({ receipt_id: `rcpt_${envelope.seq}`, seq: envelope.seq }), {
        status: 200,
        headers: { date: new Date().toUTCString() },
      });
    }) as unknown as typeof fetch,
  };
  return fake;
}

export interface Harness {
  dir: string;
  config: ConnectorConfig;
  publicKeyB64: string;
  aegis: FakeAegis;
  /** Create another connector sharing the same Aegis fake and key, separate state_dir. */
  startSibling(stateDirName?: string): Promise<{ connector: Connector; base: string; dir: string }>;
  start(): Promise<{ connector: Connector; base: string }>;
  cleanup(): Promise<void>;
}

export async function makeHarness(overrides: Record<string, unknown> = {}): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "aegis-connector-test-"));
  const keys = await generateKeyPair();
  const keyPath = join(dir, "source.key");
  await writePrivateKey(keyPath, keys.privateKey);
  const config = parseConfig(
    {
      source_id: "src_test",
      key_id: "k_test_1",
      private_key_path: keyPath,
      aegis_url: "http://aegis.test",
      ingest_bearer: "ingest_test_key",
      state_dir: join(dir, "state"),
      listen: { host: "127.0.0.1", port: 0 },
      sync_wait_ms: 500,
      retry: { initial_ms: 10, max_ms: 40, factor: 2, jitter: 0 },
      ...overrides,
    },
    dir,
    {},
  );
  const aegis = fakeAegis();
  const running: Connector[] = [];
  return {
    dir,
    config,
    publicKeyB64: keys.publicKeyB64,
    aegis,
    async start() {
      const connector = await createConnector(config, { fetch: aegis.fetch });
      running.push(connector);
      const addr = await connector.listen();
      return { connector, base: `http://127.0.0.1:${addr.port}` };
    },
    async startSibling(stateDirName = `state_${running.length + 1}`) {
      const siblingDir = join(dir, stateDirName);
      const siblingConfig = parseConfig(
        {
          source_id: config.source_id,
          key_id: config.key_id,
          private_key_path: keyPath,
          aegis_url: config.aegis_url,
          ingest_bearer: config.ingest_bearer,
          ingest_path: config.ingest_path,
          confirm_path: config.confirm_path,
          state_dir: siblingDir,
          listen: { host: "127.0.0.1", port: 0 },
          sync_wait_ms: config.sync_wait_ms,
          request_timeout_ms: config.request_timeout_ms,
          retry: config.retry,
          local_auth_token: config.local_auth_token,
        },
        dir,
        {},
      );
      const connector = await createConnector(siblingConfig, { fetch: aegis.fetch });
      running.push(connector);
      const addr = await connector.listen();
      return { connector, base: `http://127.0.0.1:${addr.port}`, dir: siblingDir };
    },
    async cleanup() {
      await Promise.all(running.map((c) => c.close()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

export function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
