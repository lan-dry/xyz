import {
  PolicyDeniedError,
  signEvent,
  wrapFetch,
  type ApsEvent,
  type IngestResult,
  type SignAndIngestOptions,
  type SignOptions,
} from "@salanor/aegis";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { postEvent } from "../src/routes/events.js";
import { postPolicyEvaluate } from "../src/routes/policy-evaluate.js";

const databaseUrl = process.env.DATABASE_URL;
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";
const describeIfDb = databaseUrl ? describe : describe.skip;

const DEV_ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const INGEST_KEY = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";

const signOpts: SignOptions = { privateKeyB64: privateKeyB64!, keyId: DEV_KEY };
const ingestOpts: SignAndIngestOptions = {
  apiBaseUrl: "http://test.local",
  ingestApiKey: INGEST_KEY,
};

function apiApp() {
  const app = new Hono();
  app.post("/v1/aegis/events", postEvent);
  app.post("/v1/aegis/policy/evaluate", postPolicyEvaluate);
  return app;
}

async function evaluateInProcess(input: {
  organization_id: string;
  agent_id: string;
  tool_name: string;
}) {
  const res = await apiApp().request("/v1/aegis/policy/evaluate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INGEST_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? `evaluate ${res.status}`);
  }
  return res.json() as {
    decision: "allow" | "deny";
    policy_id: string;
    rule_id: string | null;
    reason: string;
  };
}

async function ingestInProcess(
  event: ApsEvent,
  sign: SignOptions,
): Promise<IngestResult> {
  const signed = await signEvent(event, sign);
  const res = await apiApp().request("/v1/aegis/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INGEST_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(signed),
  });
  const body = (await res.json()) as IngestResult & { error?: string };
  if (!res.ok) {
    throw new Error(`Ingest failed (${res.status}): ${body.error}`);
  }
  return body;
}

function startMockUpstream(): Promise<{
  server: Server;
  url: string;
  getRequestCount: () => number;
}> {
  let requestCount = 0;
  return new Promise((resolvePromise) => {
    const server = createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("mock server address unavailable");
      }
      resolvePromise({
        server,
        url: `http://127.0.0.1:${addr.port}/upstream`,
        getRequestCount: () => requestCount,
      });
    });
  });
}

async function eventsForTrace(traceId: string) {
  const result = await getPool().query<{
    action_kind: string;
    policy_decision: string;
  }>(
    `SELECT action_kind, policy_decision FROM event
     WHERE organization_id = $1 AND trace_id = $2
     ORDER BY sequence_num ASC`,
    [DEV_ORG, traceId],
  );
  return result.rows;
}

describeIfDb("wrapFetch proxy", () => {
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

  it("deny rule: zero outbound requests, one deny policy_decision in DB", async () => {
    const mock = await startMockUpstream();
    const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    try {
      await expect(
        wrapFetch(
          mock.url,
          { method: "GET" },
          {
            context: {
              organizationId: DEV_ORG,
              agentId: DEV_AGENT,
              keyId: DEV_KEY,
              traceId,
              toolName: "stripe.paymentIntents.create",
            },
            sign: signOpts,
            ingest: ingestOpts,
            fetchImpl: fetch,
            ingestFn: ingestInProcess,
            evaluatePolicyFn: evaluateInProcess,
          },
        ),
      ).rejects.toBeInstanceOf(PolicyDeniedError);

      expect(mock.getRequestCount()).toBe(0);

      const rows = await eventsForTrace(traceId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        action_kind: "policy_decision",
        policy_decision: "deny",
      });
    } finally {
      mock.server.close();
    }
  });

  it("allow rule: one outbound request, allow policy_decision + result in DB", async () => {
    const mock = await startMockUpstream();
    const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    try {
      const res = await wrapFetch(
        mock.url,
        { method: "GET" },
        {
          context: {
            organizationId: DEV_ORG,
            agentId: DEV_AGENT,
            keyId: DEV_KEY,
            traceId,
            toolName: "demo.echo",
          },
          sign: signOpts,
          ingest: ingestOpts,
          fetchImpl: fetch,
          ingestFn: ingestInProcess,
          evaluatePolicyFn: evaluateInProcess,
        },
      );

      expect(res.status).toBe(200);
      expect(mock.getRequestCount()).toBe(1);

      const rows = await eventsForTrace(traceId);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        action_kind: "policy_decision",
        policy_decision: "allow",
      });
      expect(rows[1]).toEqual({
        action_kind: "result",
        policy_decision: "allow",
      });
    } finally {
      mock.server.close();
    }
  });
});
