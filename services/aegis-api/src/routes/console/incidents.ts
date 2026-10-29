import { Hono } from "hono";
import { canWriteOrgConsole } from "@salanor/platform-auth";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import {
  addIncidentNote,
  createIncident,
  ensureDuplicatePayoutIncident,
  getIncident,
  listIncidentNotes,
  listIncidents,
  updateIncident,
} from "../../repo/incidents.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function serializeIncident(row: Awaited<ReturnType<typeof getIncident>>) {
  if (!row) return null;
  return {
    incident_id: row.incident_id,
    environment: row.environment,
    title: row.title,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    trace_id: row.trace_id,
    event_id: row.event_id,
    workflow_id: row.workflow_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    resolved_at: row.resolved_at?.toISOString() ?? null,
  };
}

export const incidentRoutes = new Hono<{ Variables: ConsoleVariables }>();

incidentRoutes.get("/incidents", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const envRaw = c.req.query("environment")?.trim();
  const environment =
    envRaw === "sandbox" || envRaw === "production" ? envRaw : undefined;
  const pool = getPool();
  try {
    if (c.req.query("ensure") === "duplicate-payout") {
      await ensureDuplicatePayoutIncident(
        pool,
        orgId,
        environment ?? "production",
      );
    }
    const rows = await listIncidents(pool, orgId, environment);
    return c.json({ incidents: rows.map(serializeIncident) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("incident") && message.includes("does not exist")) {
      return c.json(
        {
          error: "Incidents require migration 009. Run: pnpm db:migrate",
          incidents: [],
        },
        503,
      );
    }
    throw error;
  }
});

incidentRoutes.get("/incidents/:incidentId", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const incidentId = c.req.param("incidentId");
  if (!incidentId) return c.json({ error: "incidentId required" }, 422);
  const pool = getPool();
  const row = await getIncident(pool, orgId, incidentId);
  if (!row) return c.json({ error: "Not found" }, 404);
  const notes = await listIncidentNotes(pool, orgId, incidentId);
  return c.json({
    incident: serializeIncident(row),
    notes: notes.map((n) => ({
      note_id: n.note_id,
      body: n.body,
      created_at: n.created_at.toISOString(),
    })),
  });
});

incidentRoutes.post("/incidents", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canWriteOrgConsole(session, session.organizationId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: {
    title?: string;
    severity?: string;
    summary?: string;
    trace_id?: string;
    event_id?: string;
    environment?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.title?.trim()) return c.json({ error: "title required" }, 422);
  const environment =
    body.environment === "sandbox" ? "sandbox" : "production";
  const created = await createIncident(getPool(), {
    organizationId: session.organizationId,
    environment,
    title: body.title,
    severity: body.severity,
    summary: body.summary,
    traceId: body.trace_id,
    eventId: body.event_id,
    createdBy: session.userId,
  });
  await auditFromConsoleSession(getPool(), session, {
    action: "incident.created",
    resourceType: "incident",
    resourceId: created.incident_id,
  });
  return c.json({ incident: serializeIncident(created) }, 201);
});

incidentRoutes.patch("/incidents/:incidentId", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canWriteOrgConsole(session, session.organizationId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const incidentId = c.req.param("incidentId");
  if (!incidentId) return c.json({ error: "incidentId required" }, 422);
  let body: {
    title?: string;
    severity?: string;
    status?: string;
    summary?: string | null;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const updated = await updateIncident(
    getPool(),
    session.organizationId,
    incidentId,
    body,
  );
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json({ incident: serializeIncident(updated) });
});

incidentRoutes.post(
  "/incidents/:incidentId/notes",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (!canWriteOrgConsole(session, session.organizationId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const incidentId = c.req.param("incidentId");
    if (!incidentId) return c.json({ error: "incidentId required" }, 422);
    let body: { body?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (!body.body?.trim()) return c.json({ error: "body required" }, 422);
    const incident = await getIncident(
      getPool(),
      session.organizationId,
      incidentId,
    );
    if (!incident) return c.json({ error: "Not found" }, 404);
    const note = await addIncidentNote(getPool(), {
      organizationId: session.organizationId,
      incidentId,
      body: body.body,
      authorUserId: session.userId,
    });
    return c.json({
      note: {
        note_id: note.note_id,
        body: note.body,
        created_at: note.created_at.toISOString(),
      },
    }, 201);
  },
);
