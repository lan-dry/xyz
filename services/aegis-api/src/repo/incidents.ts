import { randomUUID } from "node:crypto";
import type pg from "pg";

export type IncidentRow = {
  incident_id: string;
  organization_id: string;
  environment: string;
  title: string;
  severity: string;
  status: string;
  summary: string | null;
  trace_id: string | null;
  event_id: string | null;
  workflow_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
};

export type IncidentNoteRow = {
  note_id: string;
  incident_id: string;
  organization_id: string;
  author_user_id: string | null;
  body: string;
  created_at: Date;
};

export async function listIncidents(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment?: "production" | "sandbox",
): Promise<IncidentRow[]> {
  const result = await client.query<IncidentRow>(
    `SELECT * FROM incident
     WHERE organization_id = $1
       AND ($2::text IS NULL OR environment = $2)
     ORDER BY created_at DESC
     LIMIT 200`,
    [organizationId, environment ?? null],
  );
  return result.rows;
}

export async function getIncident(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  incidentId: string,
): Promise<IncidentRow | null> {
  const result = await client.query<IncidentRow>(
    `SELECT * FROM incident
     WHERE organization_id = $1 AND incident_id = $2`,
    [organizationId, incidentId],
  );
  return result.rows[0] ?? null;
}

export async function listIncidentNotes(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  incidentId: string,
): Promise<IncidentNoteRow[]> {
  const result = await client.query<IncidentNoteRow>(
    `SELECT * FROM incident_note
     WHERE organization_id = $1 AND incident_id = $2
     ORDER BY created_at ASC`,
    [organizationId, incidentId],
  );
  return result.rows;
}

export async function createIncident(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    environment: "production" | "sandbox";
    title: string;
    severity?: string;
    summary?: string | null;
    traceId?: string | null;
    eventId?: string | null;
    workflowId?: string | null;
    createdBy?: string | null;
  },
): Promise<IncidentRow> {
  const incidentId = `inc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const severity = ["low", "medium", "high", "critical"].includes(
    params.severity ?? "",
  )
    ? params.severity!
    : "medium";
  const result = await client.query<IncidentRow>(
    `INSERT INTO incident (
       incident_id, organization_id, environment, title, severity, summary,
       trace_id, event_id, workflow_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      incidentId,
      params.organizationId,
      params.environment,
      params.title.trim(),
      severity,
      params.summary?.trim() || null,
      params.traceId?.trim() || null,
      params.eventId?.trim() || null,
      params.workflowId?.trim() || null,
      params.createdBy ?? null,
    ],
  );
  return result.rows[0]!;
}

export async function updateIncident(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  incidentId: string,
  patch: {
    title?: string;
    severity?: string;
    status?: string;
    summary?: string | null;
  },
): Promise<IncidentRow | null> {
  const current = await getIncident(client, organizationId, incidentId);
  if (!current) return null;
  const status = patch.status ?? current.status;
  const resolvedAt =
    status === "resolved" || status === "closed"
      ? (current.resolved_at ?? new Date())
      : null;
  const result = await client.query<IncidentRow>(
    `UPDATE incident SET
       title = $1,
       severity = $2,
       status = $3,
       summary = $4,
       resolved_at = $5,
       updated_at = now()
     WHERE organization_id = $6 AND incident_id = $7
     RETURNING *`,
    [
      patch.title?.trim() ?? current.title,
      patch.severity ?? current.severity,
      status,
      patch.summary !== undefined ? patch.summary?.trim() || null : current.summary,
      resolvedAt,
      organizationId,
      incidentId,
    ],
  );
  return result.rows[0] ?? null;
}

export async function addIncidentNote(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    incidentId: string;
    body: string;
    authorUserId?: string | null;
  },
): Promise<IncidentNoteRow> {
  const noteId = `note_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const result = await client.query<IncidentNoteRow>(
    `INSERT INTO incident_note (
       note_id, incident_id, organization_id, author_user_id, body
     ) VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      noteId,
      params.incidentId,
      params.organizationId,
      params.authorUserId ?? null,
      params.body.trim(),
    ],
  );
  return result.rows[0]!;
}

/** Seed duplicate-payout incident for Northwind demos when missing. */
export async function ensureDuplicatePayoutIncident(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox" = "production",
): Promise<IncidentRow> {
  const existing = await client.query<{ incident_id: string }>(
    `SELECT incident_id FROM incident
     WHERE organization_id = $1 AND environment = $2
       AND title = $3
     LIMIT 1`,
    [organizationId, environment, "Duplicate merchant payout"],
  );
  if (existing.rows[0]) {
    const row = await getIncident(client, organizationId, existing.rows[0].incident_id);
    if (row) return row;
  }

  const denied = await client.query<{
    trace_id: string;
    event_id: string;
  }>(
    `SELECT e.trace_id, e.event_id
     FROM event e
     WHERE e.organization_id = $1
       AND (
         e.policy_decision = 'deny'
         OR e.payload::text ILIKE '%duplicate%'
         OR e.tool_name ILIKE '%payout%'
       )
     ORDER BY e.emitted_at DESC
     LIMIT 1`,
    [organizationId],
  );

  const incident = await createIncident(client, {
    organizationId,
    environment,
    title: "Duplicate merchant payout",
    severity: "high",
    summary:
      "Same merchant received overlapping payouts. Investigate sealed trail, replay steps, and compare what policy would do today.",
    traceId: denied.rows[0]?.trace_id ?? null,
    eventId: denied.rows[0]?.event_id ?? null,
  });

  await addIncidentNote(client, {
    organizationId,
    incidentId: incident.incident_id,
    body: "Seeded for Phase 5 demo. Open linked case → Replay, then run Policy today.",
  });

  return incident;
}
