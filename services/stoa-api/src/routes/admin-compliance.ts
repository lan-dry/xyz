import { Hono } from "hono";
import { runTenantRetention } from "../compliance/retention.js";
import { dispatchSiemWebhook } from "../compliance/siem-dispatch.js";
import { getPool } from "../db/pool.js";
import {
  adminAccessForbidden,
  loadAdminAccess,
  requireOrgRead,
  requireOrgWrite,
} from "../auth/admin-access.js";
import {
  resolveExportSigningSecret,
  sha256Hex,
  signExportBundle,
  type SignedExportManifest,
} from "../compliance/export-signing.js";
import { getTenantSettings } from "../tenant/settings.js";

export const adminComplianceRoutes = new Hono();

adminComplianceRoutes.use("*", async (c, next) => {
  await loadAdminAccess(c);
  await next();
});

function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) {
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

adminComplianceRoutes.get("/exports/audit", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const from = parseIsoDate(c.req.query("from") ?? undefined);
  const to = parseIsoDate(c.req.query("to") ?? undefined);
  const limit = Math.min(
    50000,
    Math.max(1, Number(c.req.query("limit")) || 5000),
  );
  const params: unknown[] = [tenantId];
  let where = "e.tenant_id = $1";
  if (from) {
    params.push(from);
    where += ` AND e.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND e.created_at <= $${params.length}`;
  }
  params.push(limit);
  const result = await getPool().query<{
    id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    created_at: Date;
    user_email: string | null;
  }>(
    `SELECT e.id, e.event_type, e.metadata, e.created_at, u.external_id AS user_email
     FROM stoa_audit_event e
     LEFT JOIN stoa_user u ON u.id = e.user_id
     WHERE ${where}
     ORDER BY e.created_at ASC
     LIMIT $${params.length}`,
    params,
  );
  const format = c.req.query("format") === "json" ? "json" : "csv";
  const rows = result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    createdAt: row.created_at.toISOString(),
    userEmail: row.user_email,
    metadata: row.metadata,
  }));

  if (format === "json") {
    return c.json({ exportedAt: new Date().toISOString(), events: rows });
  }

  const header = "id,eventType,createdAt,userEmail,metadata\n";
  const csv =
    header +
    rows
      .map((r) =>
        [
          r.id,
          r.eventType,
          r.createdAt,
          r.userEmail ?? "",
          JSON.stringify(r.metadata),
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="stoa-audit-export.csv"`,
  );
  return c.body(csv);
});

adminComplianceRoutes.get("/exports/audit/bundle", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const from = parseIsoDate(c.req.query("from") ?? undefined);
  const to = parseIsoDate(c.req.query("to") ?? undefined);
  const limit = Math.min(
    50000,
    Math.max(1, Number(c.req.query("limit")) || 5000),
  );
  const settings = await getTenantSettings(tenantId);
  const signingSecret = resolveExportSigningSecret(
    settings.compliance.exportSigningSecret,
  );
  if (!signingSecret) {
    return c.json({ error: "Add a signing key in Compliance first." }, 409);
  }

  const params: unknown[] = [tenantId];
  let where = "e.tenant_id = $1";
  if (from) {
    params.push(from);
    where += ` AND e.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND e.created_at <= $${params.length}`;
  }
  params.push(limit);
  const result = await getPool().query<{
    id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    created_at: Date;
    user_email: string | null;
  }>(
    `SELECT e.id, e.event_type, e.metadata, e.created_at, u.external_id AS user_email
     FROM stoa_audit_event e
     LEFT JOIN stoa_user u ON u.id = e.user_id
     WHERE ${where}
     ORDER BY e.created_at ASC
     LIMIT $${params.length}`,
    params,
  );
  const events = result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    createdAt: row.created_at.toISOString(),
    userEmail: row.user_email,
    metadata: row.metadata,
  }));
  const eventsJson = JSON.stringify(events);
  const manifest: SignedExportManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tenantId,
    eventCount: events.length,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    contentSha256: sha256Hex(eventsJson),
  };
  const signature = signExportBundle(signingSecret, manifest);
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="stoa-audit-bundle.json"`,
  );
  return c.json({
    manifest,
    signature,
    signatureAlgorithm: "HMAC-SHA256",
    events,
  });
});

adminComplianceRoutes.get("/exports/usage", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const users = await getPool().query<{
    external_id: string;
    display_name: string | null;
    message_count: string;
    thread_count: string;
    attachment_bytes: string;
  }>(
    `SELECT u.external_id, u.display_name,
            (SELECT COUNT(*)::text FROM stoa_message m
               JOIN stoa_thread t ON t.id = m.thread_id
               WHERE t.user_id = u.id AND m.role = 'user') AS message_count,
            (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count,
            COALESCE((
              SELECT SUM(attachment_bytes)::text FROM stoa_usage_monthly um
              WHERE um.user_id = u.id AND um.tenant_id = u.tenant_id
            ), '0') AS attachment_bytes
     FROM stoa_user u
     WHERE u.tenant_id = $1
     ORDER BY u.external_id`,
    [tenantId],
  );
  const payload = {
    exportedAt: new Date().toISOString(),
    users: users.rows.map((u) => ({
      email: u.external_id,
      displayName: u.display_name,
      userMessages: Number(u.message_count),
      threads: Number(u.thread_count),
      attachmentBytes: Number(u.attachment_bytes),
    })),
  };
  if (c.req.query("format") === "csv") {
    const header = "email,displayName,userMessages,threads,attachmentBytes\n";
    const csv =
      header +
      payload.users
        .map((u) =>
          [
            u.email,
            u.displayName ?? "",
            u.userMessages,
            u.threads,
            u.attachmentBytes,
          ]
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\n");
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="stoa-usage-export.csv"`,
    );
    return c.body(csv);
  }
  return c.json(payload);
});

adminComplianceRoutes.get("/compliance/status", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const settings = await getTenantSettings(tenantId);
  return c.json({
    exportSigningConfigured: Boolean(
      resolveExportSigningSecret(settings.compliance.exportSigningSecret),
    ),
    retentionEnforced: settings.retention.enforce,
  });
});

adminComplianceRoutes.post("/compliance/retention/run", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const settings = await getTenantSettings(tenantId);
  if (!settings.retention.enforce) {
    return c.json({ error: "Retention is turned off." }, 409);
  }
  const result = await runTenantRetention(tenantId, settings.retention);
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.retention.run', $3::jsonb)`,
    [tenantId, userId, JSON.stringify(result)],
  );
  if (
    settings.compliance.siemNotifyOnRetentionRun &&
    settings.compliance.siemWebhookUrl
  ) {
    await dispatchSiemWebhook(settings.compliance, {
      type: "retention.run",
      tenantId,
      result,
    });
  }
  return c.json({ ok: true, result });
});

adminComplianceRoutes.post("/compliance/siem/test", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const settings = await getTenantSettings(tenantId);
  if (!settings.compliance.siemWebhookUrl?.trim()) {
    return c.json({ ok: false, error: "Add a webhook URL first." }, 409);
  }
  const dispatch = await dispatchSiemWebhook(settings.compliance, {
    type: "siem.test",
    tenantId,
    message: "Stoa SIEM webhook connectivity test",
  });
  if (!dispatch.ok) {
    return c.json({ ok: false, error: dispatch.error }, 502);
  }
  return c.json({ ok: true });
});
