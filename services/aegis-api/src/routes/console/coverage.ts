import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import { getToolCoverage } from "../../repo/coverage.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const coverageRoutes = new Hono<{ Variables: ConsoleVariables }>();

coverageRoutes.get("/coverage", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const envRaw = c.req.query("environment")?.trim();
  const environment = envRaw === "sandbox" ? "sandbox" : "production";
  const pool = getPool();
  try {
    const coverage = await getToolCoverage(pool, orgId, environment);
    return c.json({ coverage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("declared_tools") || message.includes("does not exist")) {
      return c.json(
        {
          error: "Coverage requires migration 008. Run: pnpm db:migrate",
          coverage: {
            environment,
            governed_count: 0,
            ungoverned_count: 0,
            tools: [],
          },
        },
        503,
      );
    }
    throw error;
  }
});
