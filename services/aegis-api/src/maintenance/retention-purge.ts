import type pg from "pg";

export type RetentionPurgeResult = {
  organization_id: string;
  skipped_legal_hold: boolean;
  events_redacted: number;
  artifacts_deleted: number;
  retention_days: number | null;
};

/**
 * Soft-purge events past the plan retention window.
 * Legal hold (org-wide or per-event) always wins — held rows are never touched.
 */
export async function purgeExpiredForOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<RetentionPurgeResult> {
  const org = await client.query<{
    legal_hold: boolean;
    retention_days: number | null;
  }>(
    `SELECT o.legal_hold,
            COALESCE(
              (o.plan_overrides->>'retention_days')::int,
              pc.retention_days
            ) AS retention_days
     FROM organization o
     LEFT JOIN plan_catalog pc ON pc.plan_slug = o.plan
     WHERE o.organization_id = $1`,
    [organizationId],
  );
  const row = org.rows[0];
  if (!row) {
    return {
      organization_id: organizationId,
      skipped_legal_hold: false,
      events_redacted: 0,
      artifacts_deleted: 0,
      retention_days: null,
    };
  }

  if (row.legal_hold) {
    return {
      organization_id: organizationId,
      skipped_legal_hold: true,
      events_redacted: 0,
      artifacts_deleted: 0,
      retention_days: row.retention_days,
    };
  }

  const retentionDays = row.retention_days;
  if (retentionDays == null || retentionDays <= 0) {
    return {
      organization_id: organizationId,
      skipped_legal_hold: false,
      events_redacted: 0,
      artifacts_deleted: 0,
      retention_days: retentionDays,
    };
  }

  const artifacts = await client.query(
    `DELETE FROM artifact a
     WHERE a.organization_id = $1
       AND a.retention_until IS NOT NULL
       AND a.retention_until < now()
       AND a.worm_locked = false
       AND (
         a.event_id IS NULL
         OR EXISTS (
           SELECT 1 FROM event e
           WHERE e.event_id = a.event_id
             AND e.organization_id = $1
             AND e.legal_hold = false
         )
       )
     RETURNING a.artifact_id`,
    [organizationId],
  );

  const events = await client.query(
    `UPDATE event
     SET payload = NULL,
         args_redacted = NULL,
         purged_at = now()
     WHERE organization_id = $1
       AND legal_hold = false
       AND purged_at IS NULL
       AND emitted_at < now() - ($2::int * interval '1 day')
     RETURNING event_id`,
    [organizationId, retentionDays],
  );

  return {
    organization_id: organizationId,
    skipped_legal_hold: false,
    events_redacted: events.rowCount ?? 0,
    artifacts_deleted: artifacts.rowCount ?? 0,
    retention_days: retentionDays,
  };
}
