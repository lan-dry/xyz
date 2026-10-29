import { Hono } from "hono";
import {
  canWriteOrgConsole,
  getOrgPlanUsageSummary,
  listCustomerBillingHistory,
} from "@salanor/platform-auth";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
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

organizationRoutes.get(
  "/organization/billing-history",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const history = await listCustomerBillingHistory(getPool(), orgId, 50);
    return c.json({ history });
  },
);

organizationRoutes.get(
  "/organization/residency",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const result = await getPool().query<{
      region: string;
      topology: string;
      legal_hold: boolean;
      retention_days: number | null;
    }>(
      `SELECT o.region, o.topology, o.legal_hold,
              COALESCE(
                (o.plan_overrides->>'retention_days')::int,
                pc.retention_days
              ) AS retention_days
       FROM organization o
       LEFT JOIN plan_catalog pc ON pc.plan_slug = o.plan
       WHERE o.organization_id = $1`,
      [orgId],
    );
    const row = result.rows[0];
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({
      residency: {
        region: row.region,
        topology: row.topology,
        legal_hold: row.legal_hold,
        retention_days: row.retention_days,
        region_self_serve: false,
        note: "Region is set at onboarding. Legal hold freezes retention purge.",
      },
    });
  },
);

organizationRoutes.patch(
  "/organization/legal-hold",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canWriteOrgConsole(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    let body: { legal_hold?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (typeof body.legal_hold !== "boolean") {
      return c.json({ error: "legal_hold boolean required" }, 422);
    }
    const result = await getPool().query<{ legal_hold: boolean }>(
      `UPDATE organization
       SET legal_hold = $2, updated_at = now()
       WHERE organization_id = $1
       RETURNING legal_hold`,
      [session.organizationId, body.legal_hold],
    );
    if (!result.rows[0]) return c.json({ error: "Not found" }, 404);
    await auditFromConsoleSession(getPool(), session, {
      action: body.legal_hold ? "organization.legal_hold_on" : "organization.legal_hold_off",
      resourceType: "organization",
      resourceId: session.organizationId,
    });
    return c.json({ legal_hold: result.rows[0].legal_hold });
  },
);

organizationRoutes.post(
  "/events/:eventId/legal-hold",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canWriteOrgConsole(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const eventId = c.req.param("eventId");
    if (!eventId) return c.json({ error: "eventId required" }, 422);
    let body: { legal_hold?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (typeof body.legal_hold !== "boolean") {
      return c.json({ error: "legal_hold boolean required" }, 422);
    }
    const result = await getPool().query<{ event_id: string; legal_hold: boolean }>(
      `UPDATE event
       SET legal_hold = $3
       WHERE organization_id = $1 AND event_id = $2
       RETURNING event_id, legal_hold`,
      [session.organizationId, eventId, body.legal_hold],
    );
    if (!result.rows[0]) return c.json({ error: "Not found" }, 404);
    await auditFromConsoleSession(getPool(), session, {
      action: body.legal_hold ? "event.legal_hold_on" : "event.legal_hold_off",
      resourceType: "event",
      resourceId: eventId,
    });
    return c.json({
      event_id: result.rows[0].event_id,
      legal_hold: result.rows[0].legal_hold,
    });
  },
);
