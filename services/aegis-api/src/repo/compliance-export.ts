import { randomUUID } from "node:crypto";
import type pg from "pg";

export type ComplianceExportRow = {
  export_id: string;
  organization_id: string;
  requested_by: string | null;
  bundle_type: string;
  status: string;
  storage_uri: string | null;
  integrity_hash: string | null;
  period_start: Date;
  period_end: Date;
  generated_at: Date | null;
  expires_at: Date | null;
  event_count: number | null;
  byte_size: string | null;
};

const BUNDLE_TYPES = new Set(["soc2", "eu_ai_act", "combined"]);

export function isValidBundleType(value: string): boolean {
  return BUNDLE_TYPES.has(value);
}

export async function createComplianceExport(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    requestedBy: string | null;
    bundleType: string;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<ComplianceExportRow> {
  const exportId = `exp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const result = await client.query<ComplianceExportRow>(
    `INSERT INTO compliance_export (
       export_id, organization_id, requested_by, bundle_type,
       status, period_start, period_end
     ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING *`,
    [
      exportId,
      input.organizationId,
      input.requestedBy,
      input.bundleType,
      input.periodStart,
      input.periodEnd,
    ],
  );
  return result.rows[0]!;
}

export async function getComplianceExport(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  exportId: string,
): Promise<ComplianceExportRow | null> {
  const result = await client.query<ComplianceExportRow>(
    `SELECT * FROM compliance_export
     WHERE organization_id = $1 AND export_id = $2`,
    [organizationId, exportId],
  );
  return result.rows[0] ?? null;
}

export async function listComplianceExports(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<ComplianceExportRow[]> {
  const result = await client.query<ComplianceExportRow>(
    `SELECT * FROM compliance_export
     WHERE organization_id = $1
     ORDER BY period_start DESC`,
    [organizationId],
  );
  return result.rows;
}

export async function claimPendingExport(
  client: pg.Pool | pg.PoolClient,
  exportId: string,
): Promise<ComplianceExportRow | null> {
  const result = await client.query<ComplianceExportRow>(
    `UPDATE compliance_export
     SET status = 'generating'
     WHERE export_id = $1 AND status = 'pending'
     RETURNING *`,
    [exportId],
  );
  return result.rows[0] ?? null;
}

export async function markExportReady(
  client: pg.Pool | pg.PoolClient,
  exportId: string,
  storageUri: string,
  integrityHash: string,
  eventCount: number,
  byteSize: number,
): Promise<void> {
  await client.query(
    `UPDATE compliance_export
     SET status = 'ready',
         storage_uri = $2,
         integrity_hash = $3,
         event_count = $4,
         byte_size = $5,
         generated_at = now(),
         expires_at = now() + interval '90 days'
     WHERE export_id = $1`,
    [exportId, storageUri, integrityHash, eventCount, byteSize],
  );
}

export async function markExportFailed(
  client: pg.Pool | pg.PoolClient,
  exportId: string,
): Promise<void> {
  await client.query(
    `UPDATE compliance_export SET status = 'expired' WHERE export_id = $1`,
    [exportId],
  );
}
