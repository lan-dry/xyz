import { Hono } from "hono";
import { getOrgPlanUsageSummary } from "@salanor/platform-auth";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const organizationRoutes = new Hono<{ Variables: ConsoleVariables }>();

organizationRoutes.get(
  "/organization/plan-usage",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const summary = await getOrgPlanUsageSummary(getPool(), orgId);
    if (!summary) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ plan_usage: summary });
  },
);
