/**
 * Console Exceptions API (Stage 4 reconciliation exceptions).
 *
 *   GET  /exceptions
 *   GET  /exceptions/:exceptionId
 *   POST /exceptions/:exceptionId/acknowledge  { note }
 *   POST /exceptions/:exceptionId/resolve      { note }
 */
import { Hono } from "hono";
import {
  acknowledgeException,
  ExceptionStatusError,
  getException,
  listExceptionNotes,
  listExceptions,
  resolveException,
  type ExceptionRow,
} from "../../reconciliation/exceptions.js";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";

function serialize(row: ExceptionRow) {
  return {
    exception_id: row.exception_id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    source_name: row.source_name,
    case_id: row.case_id,
    token_id: row.token_id,
    feed_id: row.feed_id,
    detail: row.detail,
    status: row.status,
    first_seen_at: row.first_seen_at.toISOString(),
    last_seen_at: row.last_seen_at.toISOString(),
    acknowledged_at: row.acknowledged_at?.toISOString() ?? null,
    acknowledged_by: row.acknowledged_by,
    acknowledge_note: row.acknowledge_note,
    resolved_at: row.resolved_at?.toISOString() ?? null,
    resolved_by: row.resolved_by,
    resolve_note: row.resolve_note,
  };
}

export const exceptionRoutes = new Hono<{ Variables: ConsoleVariables }>();

exceptionRoutes.get("/exceptions", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const statusRaw = c.req.query("status")?.trim();
  const status =
    statusRaw === "open" ||
    statusRaw === "acknowledged" ||
    statusRaw === "resolved" ||
    statusRaw === "all"
      ? statusRaw
      : "all";
  const rows = await listExceptions(getPool(), orgId, { status });
  return c.json({ exceptions: rows.map(serialize) });
});

exceptionRoutes.get(
  "/exceptions/:exceptionId",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const exceptionId = c.req.param("exceptionId");
    if (!exceptionId) return c.json({ error: "exceptionId required" }, 422);
    const row = await getException(getPool(), orgId, exceptionId);
    if (!row) return c.json({ error: "Not found" }, 404);
    const notes = await listExceptionNotes(getPool(), orgId, exceptionId);
    return c.json({
      exception: serialize(row),
      notes: notes.map((n) => ({
        note_id: n.note_id,
        action: n.action,
        note: n.note,
        actor: n.actor,
        created_at: n.created_at.toISOString(),
      })),
    });
  },
);

exceptionRoutes.post(
  "/exceptions/:exceptionId/acknowledge",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const exceptionId = c.req.param("exceptionId");
    if (!exceptionId) return c.json({ error: "exceptionId required" }, 422);
    const body = (await c.req.json().catch(() => ({}))) as { note?: unknown };
    const note = typeof body.note === "string" ? body.note : "";
    try {
      const row = await acknowledgeException(
        getPool(),
        session.organizationId,
        exceptionId,
        note,
        session.email,
      );
      await auditFromConsoleSession(getPool(), session, {
        action: "reconciliation.exception.acknowledge",
        resourceType: "reconciliation_exception",
        resourceId: exceptionId,
        metadata: { note },
      });
      return c.json({ exception: serialize(row) });
    } catch (err) {
      if (err instanceof ExceptionStatusError) {
        const status =
          err.code === "not_found"
            ? 404
            : err.code === "note_required"
              ? 422
              : 409;
        return c.json({ error: err.message, code: err.code }, status);
      }
      throw err;
    }
  },
);

exceptionRoutes.post(
  "/exceptions/:exceptionId/resolve",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const exceptionId = c.req.param("exceptionId");
    if (!exceptionId) return c.json({ error: "exceptionId required" }, 422);
    const body = (await c.req.json().catch(() => ({}))) as { note?: unknown };
    const note = typeof body.note === "string" ? body.note : "";
    try {
      const row = await resolveException(
        getPool(),
        session.organizationId,
        exceptionId,
        note,
        session.email,
      );
      await auditFromConsoleSession(getPool(), session, {
        action: "reconciliation.exception.resolve",
        resourceType: "reconciliation_exception",
        resourceId: exceptionId,
        metadata: { note },
      });
      return c.json({ exception: serialize(row) });
    } catch (err) {
      if (err instanceof ExceptionStatusError) {
        const status =
          err.code === "not_found"
            ? 404
            : err.code === "note_required"
              ? 422
              : 409;
        return c.json({ error: err.message, code: err.code }, status);
      }
      throw err;
    }
  },
);
