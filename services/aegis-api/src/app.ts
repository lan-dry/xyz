import { captureException } from "@salanor/observability";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import {
  getApprovalStatus,
  postApprovalBindCheck,
  postApprovalComplete,
  postApprovalRequest,
} from "./routes/approvals.js";
import { postExecutionPermit } from "./routes/execution-permit.js";
import { postExecutionsConfirm } from "./routes/executions-confirm.js";
import { postReconciliationFeedIngest } from "./routes/reconciliation-ingest.js";
import { consoleRoutes } from "./routes/console/index.js";
import { postEvent } from "./routes/events.js";
import { postBankEvent } from "./routes/bank-events.js";
import { postBankEventBatch } from "./routes/bank-batch.js";
import { postCollectorEvent } from "./routes/collector-events.js";
import { getSourceLastSeq, postSourceEvent } from "./routes/source-events.js";
import { getEventInclusionProof } from "./routes/inclusion-proof.js";
import { postPolicyEvaluate } from "./routes/policy-evaluate.js";
import { gatewayRoutes } from "./routes/gateway.js";
import {
  getWorkflowRunLookup,
  getWorkflowRunStatus,
  postWorkflowRunCapture,
  postWorkflowRunComplete,
  postWorkflowRunStart,
  postWorkflowRunSteps,
} from "./routes/workflows.js";
import { publicRoutes } from "./routes/public/index.js";
import { pingDatabase } from "./db/pool.js";
import { maybeNotifyOpsAlerts } from "./health/alerts.js";
import { recordApiError, recordHttp5xx } from "./health/error-counters.js";
import { collectMetrics } from "./health/metrics.js";
import { requireOpsMetricsAuth } from "./health/ops-auth.js";
import { buildReadiness } from "./health/readiness.js";

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
const marketingOrigin = process.env.MARKETING_ORIGIN ?? "http://localhost:3001";

export function createApp(): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    recordApiError();
    recordHttp5xx();
    captureException(err, { path: c.req.path, service: "aegis-api" });
    return c.json({ error: "Internal server error" }, 500);
  });

  // Baseline response headers for an API origin (HSTS, nosniff, frame deny, no referrer).
  app.use(
    "*",
    secureHeaders({
      referrerPolicy: "no-referrer",
      xFrameOptions: "DENY",
      crossOriginResourcePolicy: "same-site",
    }),
  );

  app.use("*", async (c, next) => {
    await next();
    if (c.res.status >= 500) recordHttp5xx();
  });

  app.use(
    "/v1/console/*",
    cors({
      origin: [consoleOrigin, marketingOrigin],
      credentials: true,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", async (c) => {
    const db = process.env.DATABASE_URL ? await pingDatabase() : null;
    const ok = db === null || db?.ok === true;
    return c.json(
      {
        status: ok ? "ok" : "degraded",
        service: "aegis-api",
        database: db === null ? "not_configured" : db ? "up" : "down",
      },
      ok ? 200 : 503,
    );
  });

  /**
   * Readiness: database, witness (worker heartbeat + last batch age), TSA
   * reachability and receipt-signing-key reachability. See health/readiness.ts.
   */
  app.get("/ready", async (c) => {
    const result = await buildReadiness();
    void maybeNotifyOpsAlerts(result).catch((err) => {
      console.error("[ops-alert] notify failed", err);
    });
    return c.json(result.body, result.httpStatus);
  });

  const opsStatus = async (c: Context) => {
    const { readiness, body } = await collectMetrics();
    void maybeNotifyOpsAlerts(readiness).catch((err) => {
      console.error("[ops-alert] notify failed", err);
    });
    return c.json(body);
  };
  app.get("/metrics", requireOpsMetricsAuth, opsStatus);
  app.get("/v1/ops/status", requireOpsMetricsAuth, opsStatus);

  app.route("/v1/console", consoleRoutes);
  app.route("/v1/public", publicRoutes);

  /**
   * Well-known decision public keys (Stage 3). Same material as
   * GET /v1/public/decision-keys.json — published here so executors can
   * discover keys without knowing the API version prefix.
   */
  app.get("/.well-known/aegis/decision-keys.json", async (c) => {
    const { collectPublicKeys } = await import("./forensic/public-keys.js");
    const keys = await collectPublicKeys();
    return c.json(
      Object.fromEntries(keys.map((k) => [k.key_id, k.public_key_b64])),
      200,
      { "Cache-Control": "public, max-age=300" },
    );
  });

  const aegis = new Hono();
  aegis.post("/events", postEvent);
  /** Banking-pack convenience alias (sector example). Prefer /governed/events. */
  aegis.post("/bank/events", postBankEvent);
  /** Sector-neutral decision intake (same handler). */
  aegis.post("/governed/events", postBankEvent);
  /** AEGIS-SRC1 signed envelope ingest (Connector / SDK). */
  aegis.post("/source-events", postSourceEvent);
  /** Connector sync after seq_replay: last accepted seq for a source (ingest key). */
  aegis.get("/sources/:sourceId/last-seq", getSourceLastSeq);
  /** Stage 6: independent collector CDC events (source kind=collector). */
  aegis.post("/collector-events", postCollectorEvent);
  /** Batch CSV/JSONL import — always record-only; dry_run defaults true. */
  aegis.post("/bank/events/batch", postBankEventBatch);
  aegis.post("/governed/events/batch", postBankEventBatch);
  aegis.post("/policy/evaluate", postPolicyEvaluate);
  aegis.route("/", gatewayRoutes);
  aegis.post("/approvals/request", postApprovalRequest);
  aegis.get("/approvals/:approvalId", getApprovalStatus);
  aegis.post("/approvals/:approvalId/bind-check", postApprovalBindCheck);
  aegis.post("/approvals/:approvalId/complete", postApprovalComplete);
  /** In-path gate: core ledger must ask before disbursing. */
  aegis.post("/execution/permit", postExecutionPermit);
  /** Stage 3: executor confirms decision token + actual params (single-use). */
  aegis.post("/executions/confirm", postExecutionsConfirm);
  /** Stage 4: ledger / core banking feed ingest (JSONL, CSV, JSON). */
  aegis.post(
    "/reconciliation/feeds/:feedId/ingest",
    postReconciliationFeedIngest,
  );
  aegis.get("/events/:eventId/inclusion-proof", getEventInclusionProof);
  // One-shot capture must be registered before /workflows/runs/:traceId/*
  // so "capture" is never treated as a trace id.
  aegis.post("/workflows/runs/capture", postWorkflowRunCapture);
  // Alias for orchestrators / docs
  aegis.post("/workflow-bridge/record", postWorkflowRunCapture);
  aegis.post("/workflows/runs", postWorkflowRunStart);
  aegis.get("/workflows/runs/lookup", getWorkflowRunLookup);
  aegis.post("/workflows/runs/:traceId/steps", postWorkflowRunSteps);
  aegis.post("/workflows/runs/:traceId/complete", postWorkflowRunComplete);
  aegis.get("/workflows/runs/:traceId", getWorkflowRunStatus);
  app.route("/v1/aegis", aegis);

  return app;
}
