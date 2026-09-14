import { Hono } from "hono";
import { cors } from "hono/cors";
import { getPool } from "./db/pool.js";
import { requireConsoleSession } from "./middleware/session.js";

const consoleOrigin =
  process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";

export const app = new Hono();

app.onError((err, c) => {
  console.error("[insurance-api]", err);
  return c.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    500,
  );
});

app.use(
  "/v1/insurance/console/*",
  cors({
    origin: consoleOrigin,
    credentials: true,
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "insurance-api",
    product: "insurance",
    stage: 11,
  }),
);

const consoleRoutes = new Hono();

consoleRoutes.get("/overview", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  let pool;
  try {
    pool = getPool();
  } catch (err) {
    console.error("[insurance] overview db config", err);
    return c.json({
      product: "insurance",
      organization_id: session.organizationId,
      metrics: [],
      scaffold: true,
      note: "DATABASE_URL not configured for insurance-api.",
    });
  }

  try {
    const result = await pool.query<{
      metric_id: string;
      tool_risk_class: string | null;
      action_volume: string | null;
      policy_deny_rate: number | null;
      window_start: Date;
      window_end: Date;
    }>(
      `SELECT metric_id, tool_risk_class, action_volume, policy_deny_rate,
              window_start, window_end
       FROM insurance_metric
       WHERE organization_id = $1
       ORDER BY window_end DESC
       LIMIT 50`,
      [session.organizationId],
    );

    return c.json({
      product: "insurance",
      organization_id: session.organizationId,
      metrics: result.rows.map((row) => ({
        metric_id: row.metric_id,
        tool_risk_class: row.tool_risk_class,
        action_volume: row.action_volume != null ? Number(row.action_volume) : null,
        policy_deny_rate: row.policy_deny_rate,
        window_start: row.window_start.toISOString(),
        window_end: row.window_end.toISOString(),
      })),
      scaffold: true,
    });
  } catch (err) {
    console.error("[insurance] overview", err);
    return c.json({
      product: "insurance",
      organization_id: session.organizationId,
      metrics: [],
      scaffold: true,
      note: "Insurance metrics schema not loaded yet — run db:migrate.",
    });
  }
});

app.route("/v1/insurance/console", consoleRoutes);
