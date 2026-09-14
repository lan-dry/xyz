import { signEvent, type ApsEvent } from "@salanor/aegis";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { postEvent } from "../src/routes/events.js";
import { Hono } from "hono";

const databaseUrl = process.env.DATABASE_URL;
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";
const describeIfDb = databaseUrl ? describe : describe.skip;

const DEV_ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const INGEST_KEY = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";

function buildEvent(overrides: Partial<ApsEvent> = {}): ApsEvent {
  return {
    schema_version: 1,
    event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    organization_id: DEV_ORG,
    trace_id: `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    agent_id: DEV_AGENT,
    key_id: DEV_KEY,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: "test",
    action_kind: "tool_call",
    policy_decision: "allow",
    payload: { test: true },
    ...overrides,
  };
}

async function ingest(
  event: ApsEvent,
  opts: { idempotencyKey?: string; bearer?: string } = {},
): Promise<Response> {
  const app = new Hono();
  app.post("/v1/aegis/events", postEvent);
  const signed = await signEvent(event, {
    privateKeyB64: privateKeyB64!,
    keyId: DEV_KEY,
  });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.bearer ?? INGEST_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  return app.request("/v1/aegis/events", {
    method: "POST",
    headers,
    body: JSON.stringify(signed),
  });
}

describeIfDb("ingest", () => {
  beforeAll(async () => {
    await migrateUp();
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));
  });

  afterAll(async () => {
    await closePool();
  });

  it("accepts a valid signed event", async () => {
    const event = buildEvent();
    const res = await ingest(event);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { event_id: string; event_hash: string };
    expect(body.event_id).toBe(event.event_id);
    expect(body.event_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects invalid signature", async () => {
    const event = buildEvent();
    const signed = await signEvent(event, {
      privateKeyB64: privateKeyB64!,
      keyId: DEV_KEY,
    });
    signed.sig_value_b64 = Buffer.from("bad").toString("base64");
    const app = new Hono();
    app.post("/v1/aegis/events", postEvent);
    const res = await app.request("/v1/aegis/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INGEST_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signed),
    });
    expect(res.status).toBe(422);
  });

  it("rejects wrong organization for API key", async () => {
    const event = buildEvent({
      organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const res = await ingest(event);
    expect(res.status).toBe(403);
  });

  it("replays idempotency key without duplicate rows", async () => {
    const event = buildEvent();
    const key = `idem-${createHash("sha256").update(event.event_id).digest("hex").slice(0, 12)}`;
    const first = await ingest(event, { idempotencyKey: key });
    expect(first.status).toBe(201);
    const second = await ingest(event, { idempotencyKey: key });
    expect(second.status).toBe(200);

    const count = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event WHERE event_id = $1`,
      [event.event_id],
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
  });
});
