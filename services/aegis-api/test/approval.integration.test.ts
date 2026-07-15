import {
  ApprovalRequiredError,
  signEvent,
  wrapFetch,
  wrapFetchResume,
  type ApsEvent,
  type IngestResult,
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
import { ingestHumanApprovalEvent } from "../src/console/human-approval-event.js";
import { activatePolicy, createPolicy } from "../src/repo/policies.js";
import { decideApproval } from "../src/repo/approvals.js";
import { getTraceStatus } from "../src/repo/trace-status.js";
import { postEvent } from "../src/routes/events.js";
import { postPolicyEvaluate } from "../src/routes/policy-evaluate.js";
import {
  getApprovalStatus,
  postApprovalComplete,
  postApprovalRequest,
} from "../src/routes/approvals.js";

const databaseUrl = process.env.DATABASE_URL;
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";
const describeIfDb = databaseUrl ? describe : describe.skip;

const DEV_ORG = "11111111-1111-4111-8111-111111111111";
const DEV_AGENT = "agent-dev-01";
const DEV_KEY = "key-dev-01";
const DEV_USER = "22222222-2222-4222-8222-222222222222";
const INGEST_KEY = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
const OBLIGATION_TOOL = "payments.wire.transfer";

const signOpts: SignOptions = { privateKeyB64: privateKeyB64!, keyId: DEV_KEY };
const ingestOpts = {
  apiBaseUrl: "http://test.local",
  ingestApiKey: INGEST_KEY,
};

function apiApp() {
  const app = new Hono();
  app.post("/v1/aegis/events", postEvent);
  app.post("/v1/aegis/policy/evaluate", postPolicyEvaluate);
  app.post("/v1/aegis/approvals/request", postApprovalRequest);
  app.get("/v1/aegis/approvals/:approvalId", getApprovalStatus);
  app.post("/v1/aegis/approvals/:approvalId/complete", postApprovalComplete);
  return app;
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
  return res.json() as Promise<{ decision: string }>;
}

async function requestApprovalInProcess(
  _apiBaseUrl: string,
  _ingestKey: string,
  body: {
    organization_id: string;
    event_id: string;
    trace_id: string;
    tool_name: string;
    deferred: { url: string; method: string };
  },
) {
  const res = await apiApp().request("/v1/aegis/approvals/request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INGEST_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { approval_id: string; error?: string };
  if (!res.ok) {
    throw new Error(`approval request failed ${res.status}: ${data.error}`);
  }
  return data;
}

async function getApprovalStatusInProcess(approvalId: string) {
  const res = await apiApp().request(
    `/v1/aegis/approvals/${encodeURIComponent(approvalId)}`,
    { headers: { Authorization: `Bearer ${INGEST_KEY}` } },
  );
  return res.json() as Promise<{
    status: string;
    event_id: string;
    trace_id: string;
  }>;
}

async function completeTraceInProcess(
  _apiBaseUrl: string,
  _ingestKey: string,
  approvalId: string,
  traceId: string,
  _organizationId: string,
) {
  const res = await apiApp().request(
    `/v1/aegis/approvals/${encodeURIComponent(approvalId)}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INGEST_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: DEV_ORG,
        trace_id: traceId,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`complete failed ${res.status}`);
  }
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
      res.writeHead(200);
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

describeIfDb("human approvals (Stage 7 exit)", () => {
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

  it("obligation → pending → approve → tool runs → trace completed", async () => {
    const pool = getPool();
    const { policy } = await createPolicy(pool, DEV_ORG, DEV_USER, {
      name: "Wire transfer obligation",
      rules: [
        {
          tool_pattern: OBLIGATION_TOOL,
          decision: "allow_with_obligation",
          priority: 100,
        },
      ],
    });
    await activatePolicy(pool, DEV_ORG, policy.policy_id);

    const mock = await startMockUpstream();
    const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const wrapConfig = {
      context: {
        organizationId: DEV_ORG,
        agentId: DEV_AGENT,
        keyId: DEV_KEY,
        traceId,
        toolName: OBLIGATION_TOOL,
      },
      sign: signOpts,
      ingest: ingestOpts,
      fetchImpl: fetch,
      ingestFn: ingestInProcess,
      evaluatePolicyFn: evaluateInProcess,
      requestApprovalFn: requestApprovalInProcess,
    };

    try {
      let caught: ApprovalRequiredError | undefined;
      try {
        await wrapFetch(mock.url, { method: "GET" }, wrapConfig);
      } catch (err) {
        if (err instanceof ApprovalRequiredError) {
          caught = err;
        } else {
          throw err;
        }
      }
      expect(caught).toBeInstanceOf(ApprovalRequiredError);
      expect(mock.getRequestCount()).toBe(0);

      let traceStatus = await getTraceStatus(pool, DEV_ORG, traceId);
      expect(traceStatus).toBe("blocked");

      const decided = await decideApproval(
        pool,
        DEV_ORG,
        caught!.approvalId,
        DEV_USER,
        "approved",
      );
      expect(decided?.status).toBe("approved");

      await ingestHumanApprovalEvent(pool, {
        organizationId: DEV_ORG,
        traceId,
        agentId: DEV_AGENT,
        keyId: DEV_KEY,
        parentEventId: caught!.eventId,
        approverEmail: "dev@salanor.local",
        approvalId: caught!.approvalId,
        decision: "approved",
      });

      traceStatus = await getTraceStatus(pool, DEV_ORG, traceId);
      expect(traceStatus).toBe("running");

      const res = await wrapFetchResume(
        caught!.approvalId,
        mock.url,
        { method: "GET" },
        {
          ...wrapConfig,
          evaluatePolicyFn: async () => ({
            decision: "allow",
            policy_id: policy.policy_id,
            rule_id: null,
            reason: "resume",
          }),
          getApprovalStatusFn: async (_base, _key, id) =>
            getApprovalStatusInProcess(id),
          completeTraceFn: completeTraceInProcess,
        },
      );
      expect(res.status).toBe(200);
      expect(mock.getRequestCount()).toBe(1);
      traceStatus = await getTraceStatus(pool, DEV_ORG, traceId);
      expect(traceStatus).toBe("completed");

      const approvalStatus = await getApprovalStatusInProcess(caught!.approvalId);
      expect(approvalStatus.status).toBe("approved");
    } finally {
      mock.server.close();
    }
  });
});
