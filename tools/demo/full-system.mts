#!/usr/bin/env node
/**
 * Stage 12 — full system verification (blueprint final demo).
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm db:migrate && pnpm db:seed
 *   pnpm --filter aegis-api dev   (DATABASE_URL + ingest key)
 *
 * Usage: pnpm demo:full-system
 */
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import {
  ApprovalRequiredError,
  PolicyDeniedError,
  signAndIngest,
  wrapFetch,
  wrapFetchResume,
  type ApsEvent,
} from "@salanor/aegis";
import { verifyPublicBundle } from "../verifier/verify-lib.js";
import { loadEnvFile } from "./load-env.mts";

loadEnvFile();

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_SLUG = "dev-org";
const AGENT = "agent-dev-01";
const KEY = "key-dev-01";
const USER = "22222222-2222-4222-8222-222222222222";
const OBLIGATION_TOOL = "payments.wire.transfer.fullsystem";

const ingestKey = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
const privateKeyB64 = process.env.DEV_SIGNING_PRIVATE_KEY_B64;
const apiBaseUrl = (process.env.AEGIS_API_URL ?? "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);
const databaseUrl = process.env.DATABASE_URL;

if (!privateKeyB64) {
  console.error("Set DEV_SIGNING_PRIVATE_KEY_B64 in .env");
  process.exit(1);
}
if (!databaseUrl) {
  console.error("Set DATABASE_URL in .env");
  process.exit(1);
}

const sign = { privateKeyB64, keyId: KEY };
const ingest = { apiBaseUrl, ingestApiKey: ingestKey };

type StepResult = {
  step: number;
  name: string;
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
};

const results: StepResult[] = [];

function logStep(result: StepResult): void {
  results.push(result);
  const icon = result.ok ? "✓" : "✗";
  console.log(`${icon} Step ${result.step}: ${result.name}`);
  if (result.detail) {
    console.log(JSON.stringify(result.detail, null, 2));
  }
  if (result.error) {
    console.error(`  ${result.error}`);
  }
}

async function checkPrerequisites(): Promise<void> {
  const health = await fetch(`${apiBaseUrl}/health`);
  if (!health.ok) {
    throw new Error(`aegis-api health failed (${health.status})`);
  }
  const body = (await health.json()) as { database?: string; stage?: number };
  if (body.database !== "up") {
    throw new Error(
      `aegis-api database not up (${body.database ?? "unknown"}). Run docker compose + migrate.`,
    );
  }
  console.log(
    JSON.stringify({ prerequisite: "aegis-api", stage: body.stage, database: body.database }),
  );
}

function startMockServer(): Promise<{
  server: Server;
  url: string;
  getCount: () => number;
  getBodies: () => unknown[];
}> {
  let count = 0;
  const bodies: unknown[] = [];
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        count += 1;
        const raw = Buffer.concat(chunks).toString("utf8");
        if (raw) {
          try {
            bodies.push(JSON.parse(raw));
          } catch {
            bodies.push(raw);
          }
        }
        res.writeHead(200);
        res.end("ok");
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("mock listen failed");
      }
      resolvePromise({
        server,
        url: `http://127.0.0.1:${addr.port}/`,
        getCount: () => count,
        getBodies: () => bodies,
      });
    });
  });
}

async function step1ProxyAllow(traceId: string): Promise<void> {
  const mock = await startMockServer();
  try {
    mock.getCount();
    const res = await wrapFetch(`${mock.url}upstream`, { method: "GET" }, {
      context: {
        organizationId: ORG,
        agentId: AGENT,
        keyId: KEY,
        traceId,
        toolName: "demo.echo",
      },
      sign,
      ingest,
    });
    logStep({
      step: 1,
      name: "SDK proxy allow",
      ok: res.ok && mock.getCount() === 1,
      detail: { upstream_calls: mock.getCount(), http_status: res.status, trace_id: traceId },
    });
  } finally {
    mock.server.close();
  }
}

async function step2ProxyDeny(traceId: string): Promise<void> {
  const mock = await startMockServer();
  try {
    let denied = false;
    try {
      await wrapFetch(`${mock.url}upstream`, { method: "GET" }, {
        context: {
          organizationId: ORG,
          agentId: AGENT,
          keyId: KEY,
          traceId,
          toolName: "stripe.paymentIntents.create",
        },
        sign,
        ingest,
      });
    } catch (err) {
      denied = err instanceof PolicyDeniedError;
    }
    logStep({
      step: 2,
      name: "SDK proxy deny",
      ok: denied && mock.getCount() === 0,
      detail: { denied, upstream_calls: mock.getCount(), trace_id: traceId },
    });
  } finally {
    mock.server.close();
  }
}

async function step3ApprovalObligation(pool: pg.Pool): Promise<void> {
  const { createPolicy, activatePolicy } = await import(
    "../../services/aegis-api/src/repo/policies.js"
  );
  const { decideApproval } = await import(
    "../../services/aegis-api/src/repo/approvals.js"
  );
  const { getTraceStatus } = await import(
    "../../services/aegis-api/src/repo/trace-status.js"
  );
  const { ingestHumanApprovalEvent } = await import(
    "../../services/aegis-api/src/console/human-approval-event.js"
  );

  const { policy } = await createPolicy(pool, ORG, USER, {
    name: `Full-system obligation ${Date.now()}`,
    rules: [
      {
        tool_pattern: OBLIGATION_TOOL,
        decision: "allow_with_obligation",
        priority: 200,
      },
    ],
  });
  await activatePolicy(pool, ORG, policy.policy_id);

  const mock = await startMockServer();
  const traceId = `trc_fs_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  try {
    let caught: ApprovalRequiredError | undefined;
    try {
      await wrapFetch(`${mock.url}upstream`, { method: "GET" }, {
        context: {
          organizationId: ORG,
          agentId: AGENT,
          keyId: KEY,
          traceId,
          toolName: OBLIGATION_TOOL,
        },
        sign,
        ingest,
      });
    } catch (err) {
      if (err instanceof ApprovalRequiredError) {
        caught = err;
      } else {
        throw err;
      }
    }

    if (!caught) {
      logStep({
        step: 3,
        name: "Human approval obligation",
        ok: false,
        error: "Expected ApprovalRequiredError",
      });
      return;
    }

    await decideApproval(pool, ORG, caught.approvalId, USER, "approved");
    await ingestHumanApprovalEvent(pool, {
      organizationId: ORG,
      traceId,
      agentId: AGENT,
      keyId: KEY,
      parentEventId: caught.eventId,
      approverEmail: "dev@salanor.local",
      approvalId: caught.approvalId,
      decision: "approved",
    });

    const res = await wrapFetchResume(
      caught.approvalId,
      `${mock.url}upstream`,
      { method: "GET" },
      {
        context: {
          organizationId: ORG,
          agentId: AGENT,
          keyId: KEY,
          traceId,
          toolName: OBLIGATION_TOOL,
        },
        sign,
        ingest,
        evaluatePolicyFn: async () => ({
          decision: "allow",
          policy_id: policy.policy_id,
          rule_id: null,
          reason: "resume-after-approval",
        }),
      },
    );

    const traceStatus = await getTraceStatus(pool, ORG, traceId);
    logStep({
      step: 3,
      name: "Human approval obligation",
      ok:
        mock.getCount() === 1 &&
        res.ok &&
        traceStatus === "completed",
      detail: {
        approval_id: caught.approvalId,
        upstream_calls: mock.getCount(),
        trace_status: traceStatus,
      },
    });
  } finally {
    mock.server.close();
  }
}

async function step4WitnessAndTransparency(
  pool: pg.Pool,
): Promise<string> {
  const traceId = `trc_fs_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const eventId = `evt_fs_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const event: ApsEvent = {
    schema_version: 1,
    event_id: eventId,
    organization_id: ORG,
    trace_id: traceId,
    agent_id: AGENT,
    key_id: KEY,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: "full-system-demo",
    action_kind: "tool_call",
    policy_decision: "allow",
    payload: { full_system: true },
  };

  const ingested = await signAndIngest(event, sign, ingest);

  const { runWitnessBatchForOrg } = await import(
    "../../services/aegis-signer/src/batch-lib.js"
  );
  const { publishTransparencyLogForOrg } = await import(
    "../../services/aegis-api/src/transparency/publish.js"
  );

  await runWitnessBatchForOrg(pool, ORG);
  await publishTransparencyLogForOrg(pool, ORG);

  logStep({
    step: 4,
    name: "Ingest + Merkle + transparency log",
    ok: ingested.status === "created",
    detail: {
      event_id: eventId,
      event_hash: ingested.event_hash,
      trace_id: traceId,
    },
  });

  return eventId;
}

async function step5PublicVerifier(eventId: string): Promise<void> {
  const url = `${apiBaseUrl}/v1/public/orgs/${ORG_SLUG}/verify/${eventId}`;
  const response = await fetch(url);
  if (!response.ok) {
    logStep({
      step: 5,
      name: "Public inclusion verifier",
      ok: false,
      error: `GET verify failed (${response.status})`,
    });
    return;
  }
  const bundle = await response.json();
  const verification = verifyPublicBundle(bundle as Parameters<typeof verifyPublicBundle>[0]);
  logStep({
    step: 5,
    name: "Public inclusion verifier",
    ok: verification.ok,
    detail: { event_id: eventId, verification },
  });
}

async function step6ComplianceExport(pool: pg.Pool): Promise<void> {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const exportDir = await mkdtemp(join(tmpdir(), "aegis-fs-export-"));
  process.env.COMPLIANCE_EXPORT_DIR = exportDir;

  const { createComplianceExport } = await import(
    "../../services/aegis-api/src/repo/compliance-export.js"
  );
  const { runComplianceExport } = await import(
    "../../services/aegis-api/src/compliance/worker.js"
  );
  const { exportZipPath } = await import(
    "../../services/aegis-api/src/compliance/storage.js"
  );
  const { sha256FileHex } = await import(
    "../../services/aegis-api/src/compliance/integrity.js"
  );

  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  const created = await createComplianceExport(pool, {
    organizationId: ORG,
    requestedBy: USER,
    bundleType: "combined",
    periodStart,
    periodEnd,
  });

  const result = await runComplianceExport(pool, created.export_id);
  const zipPath = exportZipPath(ORG, created.export_id);
  const fileHash = await sha256FileHex(zipPath);
  const zipBytes = await readFile(zipPath);

  await rm(exportDir, { recursive: true, force: true });

  logStep({
    step: 6,
    name: "Compliance export bundle",
    ok:
      result.status === "ready" &&
      result.integrity_hash === fileHash &&
      zipBytes.length > 50,
    detail: {
      export_id: created.export_id,
      integrity_hash: result.integrity_hash,
      zip_bytes: zipBytes.length,
    },
  });
}

async function step7SiemOtlp(pool: pg.Pool): Promise<void> {
  const siemMock = await startMockServer();
  const siemDestId = "siem_fullsystem_mock";

  await pool.query(
    `INSERT INTO siem_destination (dest_id, organization_id, provider, otel_endpoint, status)
     VALUES ($1, $2, 'datadog', $3, 'active')
     ON CONFLICT (dest_id) DO UPDATE SET
       otel_endpoint = EXCLUDED.otel_endpoint,
       status = 'active'`,
    [siemDestId, ORG, siemMock.url],
  );

  const eventId = `evt_siem_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const event: ApsEvent = {
    schema_version: 1,
    event_id: eventId,
    organization_id: ORG,
    trace_id: `trc_siem_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    agent_id: AGENT,
    key_id: KEY,
    emitted_at: new Date().toISOString(),
    actor_type: "agent",
    actor_principal: "full-system-siem",
    action_kind: "tool_call",
    policy_decision: "allow",
    tool_name: "demo.siem.probe",
    payload: { siem: true },
  };

  await signAndIngest(event, sign, ingest);
  await new Promise((r) => setTimeout(r, 300));

  const bodies = siemMock.getBodies();
  await pool.query(
    `UPDATE siem_destination SET status = 'paused' WHERE dest_id = $1`,
    [siemDestId],
  );
  siemMock.server.close();

  const hasOtlp =
    bodies.length > 0 &&
    JSON.stringify(bodies[0]).includes("resourceLogs");

  logStep({
    step: 7,
    name: "SIEM OTLP export",
    ok: hasOtlp,
    detail: { otlp_payloads: bodies.length, event_id: eventId },
  });
}

async function main(): Promise<void> {
  console.log("Stage 12 — full system verification\n");
  await checkPrerequisites();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const sharedTrace = `trc_fs_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  try {
    await step1ProxyAllow(sharedTrace);
    await step2ProxyDeny(sharedTrace);
    await step3ApprovalObligation(pool);
    const witnessEventId = await step4WitnessAndTransparency(pool);
    await step5PublicVerifier(witnessEventId);
    await step6ComplianceExport(pool);
    await step7SiemOtlp(pool);
  } finally {
    await pool.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        passed: results.filter((r) => r.ok).length,
        failed: failed.length,
        steps: results,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
