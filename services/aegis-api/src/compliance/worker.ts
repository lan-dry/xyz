import type pg from "pg";
import { buildComplianceZip } from "./build-bundle.js";
import { gatherExportContext } from "./gather-context.js";
import {
  claimPendingExport,
  markExportFailed,
  markExportReady,
  type ComplianceExportRow,
} from "../repo/compliance-export.js";
import {
  ensureExportRoot,
  exportStorageUri,
  exportZipPath,
} from "./storage.js";

export async function runComplianceExport(
  client: pg.Pool | pg.PoolClient,
  exportId: string,
): Promise<{ export_id: string; status: string; integrity_hash?: string }> {
  const lookup = await client.query<ComplianceExportRow>(
    `SELECT * FROM compliance_export WHERE export_id = $1`,
    [exportId],
  );
  const row = lookup.rows[0];
  if (!row) throw new Error("Export not found");

  if (row.status === "ready") {
    return {
      export_id: exportId,
      status: "ready",
      integrity_hash: row.integrity_hash ?? undefined,
    };
  }

  if (row.status !== "pending") {
    return { export_id: exportId, status: row.status };
  }

  const claimed = await claimPendingExport(client, exportId);
  if (!claimed) {
    return { export_id: exportId, status: row.status };
  }

  try {
    await ensureExportRoot();
    const eventsResult = await client.query<{
      event_id: string;
      trace_id: string;
      agent_id: string;
      action_kind: string;
      policy_decision: string;
      tool_name: string | null;
      event_hash: string;
      emitted_at: Date;
      payload: unknown;
    }>(
      `SELECT event_id, trace_id, agent_id, action_kind, policy_decision,
              tool_name, event_hash, emitted_at, payload
       FROM event
       WHERE organization_id = $1
         AND emitted_at >= $2
         AND emitted_at <= $3
       ORDER BY emitted_at ASC`,
      [
        claimed.organization_id,
        claimed.period_start,
        claimed.period_end,
      ],
    );

    const context = await gatherExportContext(
      client,
      claimed.organization_id,
      claimed.period_start,
      claimed.period_end,
    );

    const zipPath = exportZipPath(claimed.organization_id, exportId);
    const { integrityHash, byteSize } = await buildComplianceZip({
      outputPath: zipPath,
      exportId,
      organizationId: claimed.organization_id,
      bundleType: claimed.bundle_type,
      periodStart: claimed.period_start,
      periodEnd: claimed.period_end,
      events: eventsResult.rows,
      context,
    });

    const storageUri = exportStorageUri(claimed.organization_id, exportId);
    await markExportReady(
      client,
      exportId,
      storageUri,
      integrityHash,
      eventsResult.rows.length,
      byteSize,
    );

    return {
      export_id: exportId,
      status: "ready",
      integrity_hash: integrityHash,
    };
  } catch (error) {
    await markExportFailed(client, exportId);
    throw error;
  }
}

export async function processPendingComplianceExports(
  client: pg.Pool | pg.PoolClient,
  organizationId?: string,
): Promise<number> {
  const pending = await client.query<{ export_id: string }>(
    organizationId
      ? `SELECT export_id FROM compliance_export
         WHERE organization_id = $1 AND status = 'pending'
         ORDER BY period_start`
      : `SELECT export_id FROM compliance_export
         WHERE status = 'pending'
         ORDER BY period_start`,
    organizationId ? [organizationId] : [],
  );

  let processed = 0;
  for (const row of pending.rows) {
    await runComplianceExport(client, row.export_id);
    processed += 1;
  }
  return processed;
}
