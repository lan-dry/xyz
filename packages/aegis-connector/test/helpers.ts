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
  mode: "ok" | "down" | "error500" | "unauthorized";
}

export function fakeAegis(): FakeAegis {
  const fake: FakeAegis = {
    attempts: [],
    accepted: [],
    mode: "ok",
    fetch: (async (_url: string, init: RequestInit) => {
      const envelope = JSON.parse(init.body as string) as SignedEnvelope;
      fake.attempts.push({ envelope, headers: init.headers as Record<string, string> });
      if (fake.mode === "down") {
        throw new Error("ECONNREFUSED");
      }
      if (fake.mode === "error500") {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      if (fake.mode === "unauthorized") {
        return new Response(JSON.stringify({ error: "bad key" }), { status: 401 });
      }
      const duplicate = fake.accepted.some((e) => e.idempotency_key === envelope.idempotency_key);
      if (!duplicate) {
        fake.accepted.push(envelope);
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
