import { captureException } from "@salanor/observability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { pingDatabase } from "./db/pool.js";
import { sessionAuthMiddleware } from "./auth/session-context.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { threadRoutes } from "./routes/threads.js";
import { sessionRoutes } from "./routes/session.js";
import { adminRoutes } from "./routes/admin.js";
import { chatCompletionRoutes } from "./routes/chat-completions.js";
import { registerWorkspaceAuthRoutes } from "./identity/register-auth.js";
import { identityRoutes } from "../../id/src/routes/identity.js";
import { scimRoutes } from "../../id/src/routes/scim.js";
import { registerSsoRoutes } from "../../id/src/auth/sso-workos.js";
import { runScheduledRetentionForAllTenants } from "./compliance/retention-scheduler.js";
import { PrivacyCheckUnavailableError } from "./dlp/detector.js";

const workspaceOrigin =
  process.env.STOA_WORKSPACE_ORIGIN ?? "http://localhost:3004";

export function createApp(): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    captureException(err, { path: c.req.path, service: "stoa-api" });
    if (err instanceof PrivacyCheckUnavailableError) {
      return c.json({ error: err.message }, 503);
    }
    return c.json({ error: "Internal server error" }, 500);
  });

  app.use(
    "*",
    cors({
      origin: workspaceOrigin,
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS", "DELETE"],
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Stoa-Dev-User",
        "X-Stoa-Dev-Tenant",
        "Cookie",
      ],
    }),
  );

  app.post("/v1/stoa/internal/jobs/retention", async (c) => {
    const secret = process.env.STOA_CRON_SECRET?.trim();
    const auth = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!secret || !auth || auth !== secret) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const force = c.req.query("force") === "1";
    const summary = await runScheduledRetentionForAllTenants({ force });
    return c.json(summary);
  });

  app.get("/health", async (c) => {
    const db = await pingDatabase();
    const ok = db.ok;
    return c.json(
      {
        status: ok ? "ok" : "degraded",
        service: "stoa-api",
        database: ok ? "up" : "down",
        identity: "integrated",
        error: db.error,
      },
      ok ? 200 : 503,
    );
  });

  const workspacePublic = new Hono();
  registerWorkspaceAuthRoutes(workspacePublic);
  workspacePublic.route("/id", identityRoutes);
  workspacePublic.route("/scim", scimRoutes);
  app.route("/v1/stoa", workspacePublic);
  registerSsoRoutes(app, "/v1/stoa/id");

  const api = new Hono();
  api.use("*", sessionAuthMiddleware);
  api.route("/stoa", sessionRoutes);
  api.route("/stoa", threadRoutes);
  api.route("/stoa", attachmentRoutes);
  api.route("/stoa/admin", adminRoutes);
  api.route("/", chatCompletionRoutes);

  app.route("/v1", api);

  return app;
}
