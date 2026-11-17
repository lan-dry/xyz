import { captureException } from "@salanor/observability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import {
  getApprovalStatus,
  postApprovalBindCheck,
  postApprovalComplete,
  postApprovalRequest,
} from "./routes/approvals.js";
import { consoleRoutes } from "./routes/console/index.js";
import { postEvent } from "./routes/events.js";
import { postBankEvent } from "./routes/bank-events.js";
import { postBankEventBatch } from "./routes/bank-batch.js";
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
import { buildReadiness } from "./health/readiness.js";

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
const marketingOrigin = process.env.MARKETING_ORIGIN ?? "http://localhost:3001";

export function createApp(): Hono {
  const app = new Hono();

  app.onError((err, c) => {
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
    const { httpStatus, body } = await buildReadiness();
    return c.json(body, httpStatus);
  });

  app.route("/v1/console", consoleRoutes);
  app.route("/v1/public", publicRoutes);

  const aegis = new Hono();
  aegis.post("/events", postEvent);
  /** Banking-pack convenience alias (sector example). Prefer /governed/events. */
  aegis.post("/bank/events", postBankEvent);
  /** Sector-neutral decision intake (same handler). */
  aegis.post("/governed/events", postBankEvent);
  /** Batch CSV/JSONL import — always record-only; dry_run defaults true. */
  aegis.post("/bank/events/batch", postBankEventBatch);
  aegis.post("/governed/events/batch", postBankEventBatch);
  aegis.post("/policy/evaluate", postPolicyEvaluate);
  aegis.route("/", gatewayRoutes);
  aegis.post("/approvals/request", postApprovalRequest);
  aegis.get("/approvals/:approvalId", getApprovalStatus);
  aegis.post("/approvals/:approvalId/bind-check", postApprovalBindCheck);
  aegis.post("/approvals/:approvalId/complete", postApprovalComplete);
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
