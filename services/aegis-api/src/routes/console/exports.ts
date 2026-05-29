import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { runComplianceExport } from "../../compliance/worker.js";
import { exportZipPath } from "../../compliance/storage.js";
import { sha256FileHex } from "../../compliance/integrity.js";
import {
  createComplianceExport,
  getComplianceExport,
  isValidBundleType,
  listComplianceExports,
} from "../../repo/compliance-export.js";
import {
  getComplianceSchedule,
  upsertComplianceSchedule,
} from "../../repo/compliance-schedule.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function serializeExport(row: {
  export_id: string;
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
}) {
  return {
    export_id: row.export_id,
    bundle_type: row.bundle_type,
    status: row.status,
    storage_uri: row.storage_uri,
    integrity_hash: row.integrity_hash,
    period_start: row.period_start.toISOString(),
    period_end: row.period_end.toISOString(),
    generated_at: row.generated_at?.toISOString() ?? null,
    expires_at: row.expires_at?.toISOString() ?? null,
    event_count: row.event_count,
    byte_size: row.byte_size ? Number(row.byte_size) : null,
  };
}

export const exportRoutes = new Hono<{ Variables: ConsoleVariables }>();

exportRoutes.get("/compliance/exports", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const exports = await listComplianceExports(getPool(), orgId);
  return c.json({ exports: exports.map(serializeExport) });
});

exportRoutes.post("/compliance/exports", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: {
    bundle_type?: string;
    period_start?: string;
    period_end?: string;
    run_now?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const bundleType = body.bundle_type?.trim();
  if (!bundleType || !isValidBundleType(bundleType)) {
    return c.json(
      { error: "bundle_type must be soc2, eu_ai_act, or combined" },
      422,
    );
  }

  if (!body.period_start || !body.period_end) {
    return c.json({ error: "period_start and period_end required" }, 422);
  }

  const periodStart = new Date(body.period_start);
  const periodEnd = new Date(body.period_end);
  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime())
  ) {
    return c.json({ error: "Invalid date range" }, 422);
  }

  const pool = getPool();
  const row = await createComplianceExport(pool, {
    organizationId: session.organizationId,
    requestedBy: session.userId,
    bundleType,
    periodStart,
    periodEnd,
  });

  await auditFromConsoleSession(pool, session, {
    action: "compliance.export.created",
    resourceType: "compliance_export",
    resourceId: row.export_id,
    metadata: { bundle_type: bundleType },
  });

  if (body.run_now !== false) {
    await runComplianceExport(pool, row.export_id);
    const updated = await getComplianceExport(
      pool,
      session.organizationId,
      row.export_id,
    );
    return c.json({ export: serializeExport(updated ?? row) }, 201);
  }

  return c.json({ export: serializeExport(row) }, 201);
});

exportRoutes.get(
  "/compliance/exports/:exportId",
  requireConsoleSession,
  async (c) => {
    const orgId = c.get("consoleSession").organizationId;
    const exportId = c.req.param("exportId");
    if (!exportId) {
      return c.json({ error: "exportId required" }, 422);
    }
    const row = await getComplianceExport(getPool(), orgId, exportId);
    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ export: serializeExport(row) });
  },
);

exportRoutes.get(
  "/compliance/exports/:exportId/download",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const orgId = session.organizationId;
    const exportId = c.req.param("exportId");
    if (!exportId) {
      return c.json({ error: "exportId required" }, 422);
    }
    const row = await getComplianceExport(getPool(), orgId, exportId);
    if (!row || row.status !== "ready") {
      return c.json({ error: "Not ready" }, 404);
    }

    const zipPath = exportZipPath(orgId, exportId);
    const bytes = await readFile(zipPath);
    const hash = await sha256FileHex(zipPath);
    if (row.integrity_hash && hash !== row.integrity_hash) {
      return c.json({ error: "Integrity check failed" }, 500);
    }

    await auditFromConsoleSession(getPool(), session, {
      action: "compliance.export.downloaded",
      resourceType: "compliance_export",
      resourceId: exportId,
      metadata: { bundle_type: row.bundle_type },
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${exportId}.zip"`,
        "X-Integrity-Hash": hash,
      },
    });
  },
);

function serializeSchedule(row: {
  schedule_id: string;
  organization_id: string;
  bundle_type: string;
  cadence: string;
  enabled: boolean;
  day_of_month: number;
  last_run_at: Date | null;
  next_run_at: Date | null;
}) {
  return {
    schedule_id: row.schedule_id,
    bundle_type: row.bundle_type,
    cadence: row.cadence,
    enabled: row.enabled,
    day_of_month: row.day_of_month,
    last_run_at: row.last_run_at?.toISOString() ?? null,
    next_run_at: row.next_run_at?.toISOString() ?? null,
  };
}

exportRoutes.get("/compliance/schedule", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const schedule = await getComplianceSchedule(getPool(), orgId);
  return c.json({
    schedule: schedule ? serializeSchedule(schedule) : null,
  });
});

exportRoutes.put("/compliance/schedule", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: {
    enabled?: boolean;
    bundle_type?: string;
    day_of_month?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const bundleType = body.bundle_type?.trim() ?? "combined";
  if (!isValidBundleType(bundleType)) {
    return c.json(
      { error: "bundle_type must be soc2, eu_ai_act, or combined" },
      422,
    );
  }

  const dayOfMonth = body.day_of_month ?? 1;
  if (dayOfMonth < 1 || dayOfMonth > 28) {
    return c.json({ error: "day_of_month must be 1–28" }, 422);
  }

  const pool = getPool();
  const schedule = await upsertComplianceSchedule(pool, {
    organizationId: session.organizationId,
    bundleType,
    enabled: Boolean(body.enabled),
    dayOfMonth,
  });

  await auditFromConsoleSession(pool, session, {
    action: "compliance.schedule.updated",
    resourceType: "compliance_schedule",
    resourceId: schedule.schedule_id,
    metadata: {
      bundle_type: bundleType,
      enabled: Boolean(body.enabled),
      day_of_month: dayOfMonth,
    },
  });

  return c.json({ schedule: serializeSchedule(schedule) });
});
