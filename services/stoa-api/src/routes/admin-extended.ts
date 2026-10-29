import { Hono } from "hono";
import type { RedactionManifestEntry } from "../dlp/manifest.js";
import { collectThreadVault } from "../dlp/message-presentation.js";
import { rehydrateText } from "../dlp/rehydrate.js";
import { getPool } from "../db/pool.js";
import { completeChat } from "../llm/complete-chat.js";
import { getAllProviderStatus } from "../tenant/providers.js";
import { getTenantSettings } from "../tenant/settings.js";
import { getUsageSnapshot } from "../usage/quota.js";
import {
  adminAccessForbidden,
  canManageSite,
  canWriteSiteMembership,
  loadAdminAccess,
  requireConsoleRead,
  requireOrgRead,
  requireOrgWrite,
} from "../auth/admin-access.js";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function formatMessageContent(
  content: string,
  access: "metadata" | "redacted" | "full",
  threadVault: Record<string, string>,
): string | null {
  if (access === "metadata") {
    return null;
  }
  if (access === "full") {
    return rehydrateText(content, threadVault);
  }
  // Stored placeholders only — do not open the vault or re-run DLP.
  return content;
}

export const adminExtendedRoutes = new Hono();

adminExtendedRoutes.get("/sites", async (c) => {
  const access = await requireConsoleRead(c);
  if (!access) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const rows = await getPool().query<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    directory_group_external_id: string | null;
    member_count: string;
  }>(
    `SELECT s.id, s.name, s.slug, s.description, s.directory_group_external_id,
            (SELECT COUNT(*)::text FROM stoa_user u WHERE u.site_id = s.id) AS member_count
     FROM stoa_site s
     WHERE s.tenant_id = $1
     ORDER BY s.name`,
    [tenantId],
  );
  let sites = rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    directoryGroupExternalId: r.directory_group_external_id,
    memberCount: Number(r.member_count),
  }));
  if (access.siteManagerOnly) {
    sites = sites.filter((s) => access.managedSiteIds.includes(s.id));
  }
  return c.json({ sites });
});

adminExtendedRoutes.get("/sites/:siteId", async (c) => {
  const { tenantId } = c.get("stoa");
  const siteId = c.req.param("siteId");
  const access = await loadAdminAccess(c);
  if (!canManageSite(access, siteId)) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const row = await getPool().query<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    directory_group_external_id: string | null;
    created_at: Date;
    updated_at: Date;
    member_count: string;
    thread_count: string;
    message_count: string;
  }>(
    `SELECT s.id, s.name, s.slug, s.description, s.directory_group_external_id,
            s.created_at, s.updated_at,
            (SELECT COUNT(*)::text FROM stoa_user u WHERE u.site_id = s.id) AS member_count,
            (SELECT COUNT(*)::text FROM stoa_thread t
               JOIN stoa_user u ON u.id = t.user_id
               WHERE u.site_id = s.id AND t.tenant_id = $1) AS thread_count,
            (SELECT COUNT(*)::text FROM stoa_message m
               JOIN stoa_thread t ON t.id = m.thread_id
               JOIN stoa_user u ON u.id = t.user_id
               WHERE u.site_id = s.id AND t.tenant_id = $1) AS message_count
     FROM stoa_site s
     WHERE s.id = $2 AND s.tenant_id = $1`,
    [tenantId, siteId],
  );
  const s = row.rows[0];
  if (!s) {
    return c.json({ error: "Site not found." }, 404);
  }
  return c.json({
    site: {
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      directoryGroupExternalId: s.directory_group_external_id,
      createdAt: s.created_at.toISOString(),
      updatedAt: s.updated_at.toISOString(),
      memberCount: Number(s.member_count),
      threadCount: Number(s.thread_count),
      messageCount: Number(s.message_count),
    },
  });
});

adminExtendedRoutes.patch("/sites/:siteId", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId: adminUserId } = c.get("stoa");
  const siteId = c.req.param("siteId");
  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    directoryGroupExternalId?: string | null;
  }>();
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [siteId, tenantId];
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return c.json({ error: "Enter a name." }, 400);
    }
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (body.description !== undefined) {
    params.push(body.description?.trim() || null);
    sets.push(`description = $${params.length}`);
  }
  if (body.directoryGroupExternalId !== undefined) {
    params.push(body.directoryGroupExternalId?.trim() || null);
    sets.push(`directory_group_external_id = $${params.length}`);
  }
  if (sets.length === 1) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const upd = await getPool().query<{ id: string }>(
    `UPDATE stoa_site SET ${sets.join(", ")}
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    params,
  );
  if (!upd.rows[0]) {
    return c.json({ error: "Site not found." }, 404);
  }
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.site.updated', $3::jsonb)`,
    [tenantId, adminUserId, JSON.stringify({ siteId })],
  );
  return c.json({ ok: true });
});

adminExtendedRoutes.get("/sites/:siteId/members", async (c) => {
  const { tenantId } = c.get("stoa");
  const siteId = c.req.param("siteId");
  const access = await loadAdminAccess(c);
  if (!canManageSite(access, siteId)) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const rows = await getPool().query<{
    id: string;
    external_id: string;
    display_name: string | null;
    thread_count: string;
  }>(
    `SELECT u.id, u.external_id, u.display_name,
            (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count
     FROM stoa_user u
     WHERE u.tenant_id = $1 AND u.site_id = $2
     ORDER BY u.external_id`,
    [tenantId, siteId],
  );
  return c.json({
    members: rows.rows.map((u) => ({
      id: u.id,
      email: u.external_id,
      externalId: u.external_id,
      displayName: u.display_name,
      threadCount: Number(u.thread_count),
    })),
  });
});

adminExtendedRoutes.post("/sites", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const body = await c.req.json<{ name?: string; slug?: string }>();
  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: "Enter a name." }, 400);
  }
  const slug = body.slug?.trim() || slugify(name);
  const ins = await getPool().query<{ id: string; name: string; slug: string }>(
    `INSERT INTO stoa_site (tenant_id, name, slug)
     VALUES ($1, $2, $3)
     RETURNING id, name, slug`,
    [tenantId, name, slug],
  );
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.site.created', $3::jsonb)`,
    [tenantId, userId, JSON.stringify({ name, slug })],
  );
  return c.json({ site: { ...ins.rows[0], memberCount: 0 } }, 201);
});

adminExtendedRoutes.delete("/sites/:siteId", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const siteId = c.req.param("siteId");
  const del = await getPool().query(
    `DELETE FROM stoa_site WHERE id = $1 AND tenant_id = $2`,
    [siteId, tenantId],
  );
  if (del.rowCount === 0) {
    return c.json({ error: "Site not found." }, 404);
  }
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.site.deleted', $3::jsonb)`,
    [tenantId, userId, JSON.stringify({ siteId })],
  );
  return c.json({ ok: true });
});

adminExtendedRoutes.patch("/users/:stoaUserId/site", async (c) => {
  const { tenantId, userId: adminUserId } = c.get("stoa");
  const stoaUserId = c.req.param("stoaUserId");
  const body = await c.req.json<{ siteId?: string | null }>();
  const siteId = body.siteId ?? null;
  const access = await loadAdminAccess(c);
  const current = await getPool().query<{ site_id: string | null }>(
    `SELECT site_id FROM stoa_user WHERE id = $1 AND tenant_id = $2`,
    [stoaUserId, tenantId],
  );
  const previousSiteId = current.rows[0]?.site_id ?? null;
  if (!canWriteSiteMembership(access, siteId)) {
    return adminAccessForbidden(c, "You can't change this site.");
  }
  if (
    previousSiteId &&
    previousSiteId !== siteId &&
    !canWriteSiteMembership(access, previousSiteId)
  ) {
    return adminAccessForbidden(c, "You can't change this site.");
  }
  if (siteId) {
    const site = await getPool().query(
      `SELECT id FROM stoa_site WHERE id = $1 AND tenant_id = $2`,
      [siteId, tenantId],
    );
    if (!site.rows[0]) {
      return c.json({ error: "Site not found." }, 404);
    }
  }
  const upd = await getPool().query(
    `UPDATE stoa_user SET site_id = $3 WHERE id = $1 AND tenant_id = $2`,
    [stoaUserId, tenantId, siteId],
  );
  if (upd.rowCount === 0) {
    return c.json({ error: "Person not found." }, 404);
  }
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.user.site_updated', $3::jsonb)`,
    [
      tenantId,
      adminUserId,
      JSON.stringify({ stoaUserId, siteId }),
    ],
  );
  return c.json({ ok: true });
});

adminExtendedRoutes.get("/users/:stoaUserId", async (c) => {
  const { tenantId } = c.get("stoa");
  const stoaUserId = c.req.param("stoaUserId");
  const access = await loadAdminAccess(c);
  const settings = await getTenantSettings(tenantId);
  const row = await getPool().query<{
    id: string;
    external_id: string;
    display_name: string | null;
    created_at: Date;
    site_id: string | null;
    site_name: string | null;
    thread_count: string;
    message_count: string;
  }>(
    `SELECT u.id, u.external_id, u.display_name, u.created_at, u.site_id,
            s.name AS site_name,
            (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count,
            (SELECT COUNT(*)::text FROM stoa_message m
               JOIN stoa_thread t ON t.id = m.thread_id WHERE t.user_id = u.id) AS message_count
     FROM stoa_user u
     LEFT JOIN stoa_site s ON s.id = u.site_id
     WHERE u.id = $1 AND u.tenant_id = $2`,
    [stoaUserId, tenantId],
  );
  const u = row.rows[0];
  if (!u) {
    return c.json({ error: "Person not found." }, 404);
  }
  if (!access.canReadOrg) {
    if (!u.site_id || !canManageSite(access, u.site_id)) {
      return adminAccessForbidden(c, "You don't have permission to do this.");
    }
  }
  let usage = { messageCount: 0, attachmentBytes: 0 };
  try {
    const snap = await getUsageSnapshot(tenantId, stoaUserId);
    const attach = await getPool().query<{ bytes: string }>(
      `SELECT COALESCE(attachment_bytes, 0)::text AS bytes
       FROM stoa_usage_monthly
       WHERE tenant_id = $1 AND user_id = $2 AND period_month = $3::date`,
      [tenantId, stoaUserId, snap.periodMonth],
    );
    usage = {
      messageCount: snap.userMessages,
      attachmentBytes: Number(attach.rows[0]?.bytes ?? 0),
    };
  } catch {
    /* usage table optional */
  }
  return c.json({
    user: {
      id: u.id,
      email: u.external_id,
      displayName: u.display_name,
      createdAt: u.created_at.toISOString(),
      siteId: u.site_id,
      siteName: u.site_name,
      threadCount: Number(u.thread_count),
      messageCount: Number(u.message_count),
      monthMessages: usage.messageCount,
    },
    chatContentAccess: access.canReadOrg
      ? settings.adminMask.chatContentAccess
      : "metadata",
  });
});

adminExtendedRoutes.get("/users/:stoaUserId/threads", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const stoaUserId = c.req.param("stoaUserId");
  const rows = await getPool().query<{
    id: string;
    title: string;
    model_id: string;
    updated_at: Date;
    message_count: string;
  }>(
    `SELECT t.id, t.title, t.model_id, t.updated_at,
            (SELECT COUNT(*)::text FROM stoa_message m WHERE m.thread_id = t.id) AS message_count
     FROM stoa_thread t
     WHERE t.tenant_id = $1 AND t.user_id = $2
     ORDER BY t.updated_at DESC
     LIMIT 100`,
    [tenantId, stoaUserId],
  );
  return c.json({
    threads: rows.rows.map((t) => ({
      id: t.id,
      title: t.title,
      modelId: t.model_id,
      updatedAt: t.updated_at.toISOString(),
      messageCount: Number(t.message_count),
    })),
  });
});

adminExtendedRoutes.get("/threads/:threadId", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId: adminUserId } = c.get("stoa");
  const threadId = c.req.param("threadId");
  const settings = await getTenantSettings(tenantId);
  const access = settings.adminMask.chatContentAccess;

  const thread = await getPool().query<{
    id: string;
    title: string;
    model_id: string;
    user_id: string;
    external_id: string;
  }>(
    `SELECT t.id, t.title, t.model_id, t.user_id, u.external_id
     FROM stoa_thread t
     JOIN stoa_user u ON u.id = t.user_id
     WHERE t.id = $1 AND t.tenant_id = $2`,
    [threadId, tenantId],
  );
  const t = thread.rows[0];
  if (!t) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const messages = await getPool().query<{
    id: string;
    role: string;
    content: string;
    content_display: string | null;
    redaction_count: number;
    redaction_vault: string | null;
    redaction_manifest: RedactionManifestEntry[] | null;
    created_at: Date;
  }>(
    `SELECT id, role, content, content_display, redaction_count,
            redaction_vault, redaction_manifest, created_at
     FROM stoa_message WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  const threadVault =
    access === "full" ? collectThreadVault(messages.rows) : {};

  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, thread_id, event_type, metadata)
     VALUES ($1, $2, $3, 'admin.chat.reviewed', $4::jsonb)`,
    [
      tenantId,
      adminUserId,
      threadId,
      JSON.stringify({
        subjectUserId: t.user_id,
        access,
        messageCount: messages.rows.length,
      }),
    ],
  );

  return c.json({
    thread: {
      id: t.id,
      title: access === "full" ? rehydrateText(t.title, threadVault) : t.title,
      modelId: t.model_id,
      userEmail: t.external_id,
    },
    contentAccess: access,
    messages: messages.rows.map((m) => {
      // full: use stored content (includes attachment extracts) then rehydrate
      // redacted/metadata: member-facing display text (placeholders, no extracts)
      const text =
        access === "full"
          ? m.content
          : m.role === "user"
            ? (m.content_display ?? m.content)
            : m.content;
      if (access === "metadata") {
        return {
          id: m.id,
          role: m.role,
          content: null,
          contentLength: 0,
          redactionCount: 0,
          redactionManifest: [],
          createdAt: m.created_at.toISOString(),
        };
      }
      return {
        id: m.id,
        role: m.role,
        content: formatMessageContent(text, access, threadVault),
        contentLength: text.length,
        redactionCount: m.redaction_count,
        redactionManifest: m.redaction_manifest ?? [],
        createdAt: m.created_at.toISOString(),
      };
    }),
  });
});

adminExtendedRoutes.get("/reports/summary", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const settings = await getTenantSettings(tenantId);
  const usage = await getUsageSnapshot(tenantId, userId);
  const pool = getPool();

  const byModel = await pool.query<{ model_id: string; count: string }>(
    `SELECT t.model_id, COUNT(m.id)::text AS count
     FROM stoa_thread t
     JOIN stoa_message m ON m.thread_id = t.id
     WHERE t.tenant_id = $1 AND m.role = 'user'
     GROUP BY t.model_id
     ORDER BY COUNT(m.id) DESC
     LIMIT 10`,
    [tenantId],
  );

  const redactions = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(m.redaction_count), 0)::text AS total
     FROM stoa_message m
     JOIN stoa_thread t ON t.id = m.thread_id
     WHERE t.tenant_id = $1`,
    [tenantId],
  );

  const topUsers = await pool.query<{
    external_id: string;
    messages: string;
  }>(
    `SELECT u.external_id, COUNT(m.id)::text AS messages
     FROM stoa_user u
     JOIN stoa_thread t ON t.user_id = u.id
     JOIN stoa_message m ON m.thread_id = t.id AND m.role = 'user'
     WHERE u.tenant_id = $1
     GROUP BY u.external_id
     ORDER BY COUNT(m.id) DESC
     LIMIT 8`,
    [tenantId],
  );

  const auditBreakdown = await pool.query<{ event_type: string; count: string }>(
    `SELECT event_type, COUNT(*)::text AS count
     FROM stoa_audit_event
     WHERE tenant_id = $1 AND created_at > now() - interval '30 days'
     GROUP BY event_type
     ORDER BY COUNT(*) DESC
     LIMIT 12`,
    [tenantId],
  );

  const siteActivity = await pool.query<{ name: string; messages: string }>(
    `SELECT COALESCE(s.name, 'Unassigned') AS name, COUNT(m.id)::text AS messages
     FROM stoa_user u
     LEFT JOIN stoa_site s ON s.id = u.site_id
     JOIN stoa_thread t ON t.user_id = u.id
     JOIN stoa_message m ON m.thread_id = t.id AND m.role = 'user'
     WHERE u.tenant_id = $1
     GROUP BY s.name
     ORDER BY COUNT(m.id) DESC`,
    [tenantId],
  );

  const quota = settings.quotas;
  const orgPct =
    quota.maxMessagesOrgMonth > 0
      ? Math.round((usage.orgMessages / quota.maxMessagesOrgMonth) * 100)
      : 0;

  const insights: string[] = [];
  if (orgPct >= 80 && quota.enforce) {
    insights.push(
      `${orgPct}% of the monthly message quota is used.`,
    );
  }
  if (Number(redactions.rows[0]?.total ?? 0) > 0) {
    insights.push(
      `${redactions.rows[0]?.total} sensitive values were withheld from AI providers.`,
    );
  }
  if (byModel.rows[0]) {
    insights.push(
      `Most-used model: ${byModel.rows[0].model_id} (${byModel.rows[0].count} user messages).`,
    );
  }
  if (siteActivity.rows.length > 1) {
    insights.push(
      `Activity came from ${siteActivity.rows.length} sites.`,
    );
  }
  if (insights.length === 0) {
    insights.push("No activity yet this period.");
  }

  return c.json({
    periodMonth: usage.periodMonth,
    usage: {
      orgMessages: usage.orgMessages,
      orgAttachmentBytes: usage.orgAttachmentBytes,
      quotaPercent: orgPct,
    },
    redactionTotal: Number(redactions.rows[0]?.total ?? 0),
    models: byModel.rows.map((r) => ({
      modelId: r.model_id,
      userMessages: Number(r.count),
    })),
    topUsers: topUsers.rows.map((r) => ({
      email: r.external_id,
      userMessages: Number(r.messages),
    })),
    auditLast30Days: auditBreakdown.rows.map((r) => ({
      eventType: r.event_type,
      count: Number(r.count),
    })),
    siteActivity: siteActivity.rows.map((r) => ({
      site: r.name,
      userMessages: Number(r.messages),
    })),
    insights,
    chatContentAccess: settings.adminMask.chatContentAccess,
  });
});

adminExtendedRoutes.post("/reports/executive-summary", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const providers = await getAllProviderStatus(tenantId);
  if (!providers.anyConfigured) {
    return c.json({ error: "Connect a provider to generate an AI summary." }, 400);
  }
  const settings = await getTenantSettings(tenantId);
  const usage = await getUsageSnapshot(tenantId, userId);
  const pool = getPool();
  const byModel = await pool.query<{ model_id: string; count: string }>(
    `SELECT t.model_id, COUNT(m.id)::text AS count
     FROM stoa_thread t
     JOIN stoa_message m ON m.thread_id = t.id AND m.role = 'user'
     WHERE t.tenant_id = $1
     GROUP BY t.model_id ORDER BY COUNT(m.id) DESC LIMIT 5`,
    [tenantId],
  );
  const redactions = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(m.redaction_count), 0)::text AS total
     FROM stoa_message m
     JOIN stoa_thread t ON t.id = m.thread_id
     WHERE t.tenant_id = $1`,
    [tenantId],
  );

  const statsJson = JSON.stringify({
    period: usage.periodMonth,
    orgMessages: usage.orgMessages,
    orgAttachmentBytes: usage.orgAttachmentBytes,
    redactionTotal: Number(redactions.rows[0]?.total ?? 0),
    models: byModel.rows.map((r) => ({
      modelId: r.model_id,
      userMessages: Number(r.count),
    })),
    dlpProfile: settings.dlp.profile,
    quotasEnforced: settings.quotas.enforce,
  });

  const defaultModel =
    settings.defaultModelId ?? settings.enabledModelIds[0];
  if (!defaultModel) {
    return c.json({ error: "Choose a default model in Policy." }, 400);
  }

  try {
    const text = await completeChat(tenantId, defaultModel, [
      {
        role: "system",
        content:
          "You write brief executive summaries for compliance officers about governed AI workspace usage. Be factual, 3-5 bullet points, no marketing fluff.",
      },
      {
        role: "user",
        content: `Summarize this tenant activity JSON for leadership:\n${statsJson}`,
      },
    ]);
    await pool.query(
      `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
       VALUES ($1, $2, 'admin.reports.ai_summary', $3::jsonb)`,
      [tenantId, userId, JSON.stringify({ period: usage.periodMonth })],
    );
    return c.json({ summary: text });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Couldn't write the summary. Try again.",
      },
      502,
    );
  }
});

adminExtendedRoutes.get("/sites/:siteId/managers", async (c) => {
  const siteId = c.req.param("siteId");
  const access = await loadAdminAccess(c);
  if (!canManageSite(access, siteId)) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const rows = await getPool().query<{
    stoa_user_id: string;
    external_id: string;
    display_name: string | null;
  }>(
    `SELECT m.stoa_user_id, u.external_id, u.display_name
     FROM stoa_site_manager m
     JOIN stoa_user u ON u.id = m.stoa_user_id
     WHERE m.tenant_id = $1 AND m.site_id = $2
     ORDER BY u.external_id`,
    [tenantId, siteId],
  );
  return c.json({
    managers: rows.rows.map((r) => ({
      stoaUserId: r.stoa_user_id,
      email: r.external_id,
      externalId: r.external_id,
      displayName: r.display_name,
    })),
  });
});

adminExtendedRoutes.post("/sites/:siteId/managers", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const siteId = c.req.param("siteId");
  const body = await c.req.json<{ stoaUserId?: string }>();
  const stoaUserId = body.stoaUserId?.trim();
  if (!stoaUserId) {
    return c.json({ error: "Choose a person." }, 400);
  }
  const site = await getPool().query(
    `SELECT id FROM stoa_site WHERE id = $1 AND tenant_id = $2`,
    [siteId, tenantId],
  );
  if (!site.rows[0]) {
    return c.json({ error: "Site not found." }, 404);
  }
  const user = await getPool().query(
    `SELECT id FROM stoa_user WHERE id = $1 AND tenant_id = $2`,
    [stoaUserId, tenantId],
  );
  if (!user.rows[0]) {
    return c.json({ error: "Person not found." }, 404);
  }
  await getPool().query(
    `INSERT INTO stoa_site_manager (tenant_id, site_id, stoa_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [tenantId, siteId, stoaUserId],
  );
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.site.manager_added', $3::jsonb)`,
    [tenantId, userId, JSON.stringify({ siteId, stoaUserId })],
  );
  return c.json({ ok: true }, 201);
});

adminExtendedRoutes.delete("/sites/:siteId/managers/:stoaUserId", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const siteId = c.req.param("siteId");
  const stoaUserId = c.req.param("stoaUserId");
  await getPool().query(
    `DELETE FROM stoa_site_manager
     WHERE tenant_id = $1 AND site_id = $2 AND stoa_user_id = $3`,
    [tenantId, siteId, stoaUserId],
  );
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.site.manager_removed', $3::jsonb)`,
    [tenantId, userId, JSON.stringify({ siteId, stoaUserId })],
  );
  return c.json({ ok: true });
});

adminExtendedRoutes.get("/sites/:siteId/reports/summary", async (c) => {
  const siteId = c.req.param("siteId");
  const access = await loadAdminAccess(c);
  if (!canManageSite(access, siteId)) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const pool = getPool();
  const site = await pool.query<{ name: string }>(
    `SELECT name FROM stoa_site WHERE id = $1 AND tenant_id = $2`,
    [siteId, tenantId],
  );
  if (!site.rows[0]) {
    return c.json({ error: "Site not found." }, 404);
  }
  const messages = await pool.query<{ count: string }>(
    `SELECT COUNT(m.id)::text AS count
     FROM stoa_message m
     JOIN stoa_thread t ON t.id = m.thread_id
     JOIN stoa_user u ON u.id = t.user_id
     WHERE t.tenant_id = $1 AND u.site_id = $2 AND m.role = 'user'`,
    [tenantId, siteId],
  );
  const members = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM stoa_user WHERE tenant_id = $1 AND site_id = $2`,
    [tenantId, siteId],
  );
  return c.json({
    siteId,
    siteName: site.rows[0].name,
    memberCount: Number(members.rows[0]?.count ?? 0),
    userMessages: Number(messages.rows[0]?.count ?? 0),
  });
});
