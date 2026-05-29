import { captureException } from "@salanor/observability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { postApprovalComplete, getApprovalStatus, postApprovalRequest } from "./routes/approvals.js";
import { consoleRoutes } from "./routes/console/index.js";
import { postEvent } from "./routes/events.js";
import { getEventInclusionProof } from "./routes/inclusion-proof.js";
import { postPolicyEvaluate } from "./routes/policy-evaluate.js";
import { publicRoutes } from "./routes/public/index.js";
import { pingDatabase } from "./db/pool.js";

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
    const ok = db !== false;
    return c.json(
      {
        status: ok ? "ok" : "degraded",
        service: "aegis-api",
        database: db === null ? "not_configured" : db ? "up" : "down",
      },
      ok ? 200 : 503,
    );
  });

  app.route("/v1/console", consoleRoutes);
  app.route("/v1/public", publicRoutes);

  const aegis = new Hono();
  aegis.post("/events", postEvent);
  aegis.post("/policy/evaluate", postPolicyEvaluate);
  aegis.post("/approvals/request", postApprovalRequest);
  aegis.get("/approvals/:approvalId", getApprovalStatus);
  aegis.post("/approvals/:approvalId/complete", postApprovalComplete);
  aegis.get("/events/:eventId/inclusion-proof", getEventInclusionProof);
  app.route("/v1/aegis", aegis);

  return app;
}
