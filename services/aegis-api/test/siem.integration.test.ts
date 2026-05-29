import { signEvent, type ApsEvent } from "@salanor/aegis";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { persistSignedEvent } from "../src/ingest/persist.js";
import { exportEventToSiemDestinations } from "../src/siem/export.js";
import { buildOtlpLogsPayload } from "../src/siem/otel-payload.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

let mockServer: Server;
let mockPort = 0;
const receivedBodies: unknown[] = [];

function buildEvent(): ApsEvent {
  return {
    schema_version: 1,
    event_id: `evt_siem_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organization_id: ORG,
    trace_id: `trc_siem_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    agent_id: DEV_AGENT,
    key_id: DEV_KEY,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: "siem-test",
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "demo.tool",
    payload: { siem: true },
  };
}

describeIfDb("SIEM OTel export (Stage 10)", () => {
  beforeAll(async () => {
    await migrateUp();
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));

    mockServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (raw) {
          receivedBodies.push(JSON.parse(raw));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ partialSuccess: true }));
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = mockServer.address();
    mockPort = typeof addr === "object" && addr ? addr.port : 0;

    await getPool().query(
      `INSERT INTO siem_destination (
         dest_id, organization_id, provider, otel_endpoint, status
       ) VALUES ($1, $2, 'datadog', $3, 'active')
       ON CONFLICT (dest_id) DO UPDATE SET
         otel_endpoint = EXCLUDED.otel_endpoint,
         status = 'active'`,
      [
        "siem_dev_mock",
        ORG,
        `http://127.0.0.1:${mockPort}`,
      ],
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    await getPool().query(
      `UPDATE siem_destination SET status = 'paused' WHERE dest_id = 'siem_dev_mock'`,
    );
    await closePool();
  });

  it("builds OTLP logs payload with event attributes", () => {
    const event = buildEvent();
    const payload = buildOtlpLogsPayload(event);
    const record =
      (payload.resourceLogs as { scopeLogs: { logRecords: { attributes: { key: string }[] }[] }[] }[])[0]
        ?.scopeLogs[0]?.logRecords[0];
    expect(record?.attributes?.some((a) => a.key === "event.id")).toBe(true);
  });

  it("POSTs OTLP JSON to active siem_destination (mock)", async () => {
    receivedBodies.length = 0;
    const signed = await signEvent(buildEvent(), {
      privateKeyB64,
      keyId: DEV_KEY,
    });

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await persistSignedEvent(client, signed, undefined);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const result = await exportEventToSiemDestinations(getPool(), signed);
    expect(result.exported).toBe(1);
    expect(receivedBodies.length).toBeGreaterThanOrEqual(1);

    const flushed = await getPool().query<{ last_flushed_at: Date | null }>(
      `SELECT last_flushed_at FROM siem_destination WHERE dest_id = 'siem_dev_mock'`,
    );
    expect(flushed.rows[0]?.last_flushed_at).not.toBeNull();
  });
});
