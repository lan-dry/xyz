import { captureException } from "@salanor/observability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getApprovalStatus,
  postApprovalBindCheck,
  postApprovalComplete,
  postApprovalRequest,
} from "./routes/approvals.js";
import { consoleRoutes } from "./routes/console/index.js";
import { postEvent } from "./routes/events.js";
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
import { getPool, pingDatabase } from "./db/pool.js";

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
const marketingOrigin = process.env.MARKETING_ORIGIN ?? "http://localhost:3001";

export function createApp(): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    captureException(err, { path: c.req.path, service: "aegis-api" });
    return c.json({ error: "Internal server error" }, 500);
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

  app.get("/ready", async (c) => {
    const db = process.env.DATABASE_URL ? await pingDatabase() : null;
    if (!db?.ok) {
      return c.json(
        {
          status: "not_ready",
          service: "aegis-api",
          reason: db === null ? "database_not_configured" : "database_unavailable",
        },
        503,
      );
    }

    const requiredWorkers = (
      process.env.AEGIS_REQUIRED_WORKERS ?? "witness,housekeeping,compliance"
    )
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const maxAgeMinutes: Record<string, number> = {
      witness: Number(process.env.AEGIS_WITNESS_MAX_AGE_MINUTES ?? "10"),
      housekeeping: Number(process.env.AEGIS_HOUSEKEEPING_MAX_AGE_MINUTES ?? "1560"),
      compliance: Number(process.env.AEGIS_COMPLIANCE_MAX_AGE_MINUTES ?? "1560"),
    };

    try {
      const runs = await getPool().query<{
        worker_name: string;
        status: string;
        started_at: Date;
      }>(
        `SELECT DISTINCT ON (worker_name) worker_name, status, started_at
         FROM worker_run
         WHERE worker_name = ANY($1::text[])
         ORDER BY worker_name, started_at DESC`,
        [requiredWorkers],
      );
      const byName = new Map(runs.rows.map((row) => [row.worker_name, row]));
      const now = Date.now();
      const workers = requiredWorkers.map((name) => {
        const row = byName.get(name);
        const ageMinutes = row
          ? Math.max(0, Math.floor((now - row.started_at.getTime()) / 60_000))
          : null;
        const limit = maxAgeMinutes[name] ?? 60;
        const ready =
          row != null &&
          row.status !== "error" &&
          ageMinutes != null &&
          ageMinutes <= limit;
        return {
          name,
          ready,
          status: row?.status ?? "missing",
          last_run_at: row?.started_at.toISOString() ?? null,
          age_minutes: ageMinutes,
          max_age_minutes: limit,
        };
      });
      const ready = workers.every((worker) => worker.ready);
      return c.json(
        {
          status: ready ? "ready" : "not_ready",
          service: "aegis-api",
          database: "up",
          workers,
        },
        ready ? 200 : 503,
      );
    } catch {
      return c.json(
        {
          status: "not_ready",
          service: "aegis-api",
          database: "up",
          reason: "worker_status_unavailable",
        },
        503,
      );
    }
  });

  app.route("/v1/console", consoleRoutes);
  app.route("/v1/public", publicRoutes);

  const aegis = new Hono();
  aegis.post("/events", postEvent);
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
