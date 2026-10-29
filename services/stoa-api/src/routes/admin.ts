import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { getUsageSnapshot, usageTrackingReady } from "../usage/quota.js";
import { isPgMissingRelation } from "../lib/pg-error.js";
import { adminExtendedRoutes } from "./admin-extended.js";
import { adminComplianceRoutes } from "./admin-compliance.js";
import { adminGatewayRoutes } from "./admin-gateway.js";
import { invalidateSiemSettingsCache } from "../compliance/siem-audit-stream.js";
import {
  adminAccessForbidden,
  loadAdminAccess,
  requireOrgRead,
  requireOrgWrite,
} from "../auth/admin-access.js";
import {
  discoverGatewayModels,
  resolveTenantGatewayAccess,
} from "../llm/list-models.js";
import {
  getAvailableModelsForTenant,
  getEnabledModelsForTenant,
} from "../tenant/model-access.js";
import {
  getTenantSettings,
  normalizeDlp,
  updateTenantSettings,
} from "../tenant/settings.js";
import { redactForUpstream } from "../dlp/detector.js";
import { manifestGroupLabel } from "../dlp/manifest.js";
import { describePlaceholder } from "../dlp/placeholder-hints.js";
import { getOrgEmailDomains } from "../tenant/org-domains.js";
import {
  getAllProviderStatus,
  getProviderConnection,
  PROVIDER_META,
  updateOpenAiProvider,
  updateProviderConnection,
  type ProviderKind,
} from "../tenant/providers.js";
import {
  discoverAllTenantModels,
  discoverModelsForKind,
  invalidateTenantModelsCache,
} from "../llm/discover-providers.js";

export const adminRoutes = new Hono();

adminRoutes.use("*", async (c, next) => {
  await loadAdminAccess(c);
  await next();
});

adminRoutes.get("/overview", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  try {
  const { tenantId } = c.get("stoa");
  const pool = getPool();
  const tenant = await pool.query<{ name: string; slug: string }>(
    `SELECT name, slug FROM stoa_tenant WHERE id = $1`,
    [tenantId],
  );
  const stats = await pool.query<{
    users: string;
    threads: string;
    messages: string;
    audits: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM stoa_user WHERE tenant_id = $1) AS users,
       (SELECT COUNT(*)::text FROM stoa_thread WHERE tenant_id = $1) AS threads,
       (SELECT COUNT(*)::text FROM stoa_message m
          JOIN stoa_thread t ON t.id = m.thread_id WHERE t.tenant_id = $1) AS messages,
       (SELECT COUNT(*)::text FROM stoa_audit_event WHERE tenant_id = $1) AS audits`,
    [tenantId],
  );
  const settings = await getTenantSettings(tenantId);
  const enabledModels = await getEnabledModelsForTenant(tenantId);
  const available = await getAvailableModelsForTenant(tenantId);
  const { userId } = c.get("stoa");
  let usage: Awaited<ReturnType<typeof getUsageSnapshot>>;
  try {
    usage = await getUsageSnapshot(tenantId, userId);
  } catch (error) {
    console.error("[stoa] admin overview usage snapshot", error);
    const period = new Date();
    usage = {
      periodMonth: `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}-01`,
      userMessages: 0,
      orgMessages: 0,
      orgAttachmentBytes: 0,
    };
  }
  const privacy = await pool.query<{
    group: string;
    label: string;
    count: string;
  }>(
    `SELECT entry->>'group' AS "group", entry->>'label' AS label,
            SUM((entry->>'count')::int)::text AS count
     FROM stoa_message m
     JOIN stoa_thread t ON t.id = m.thread_id
     CROSS JOIN LATERAL jsonb_array_elements(m.redaction_manifest) AS entry
     WHERE t.tenant_id = $1 AND m.role = 'user'
       AND m.created_at >= date_trunc('month', now())
     GROUP BY 1, 2
     ORDER BY SUM((entry->>'count')::int) DESC`,
    [tenantId],
  );
  const protectedMessages = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM stoa_message m
     JOIN stoa_thread t ON t.id = m.thread_id
     WHERE t.tenant_id = $1 AND m.role = 'user' AND m.redaction_count > 0
       AND m.created_at >= date_trunc('month', now())`,
    [tenantId],
  );
  const row = tenant.rows[0];
  const s = stats.rows[0];
  const allProviders = await getAllProviderStatus(tenantId);
  const providerConnected =
    available.source !== "none" || allProviders.anyConfigured;
  const policyReady =
    providerConnected && settings.enabledModelIds.length > 0;
  const workspaceReady =
    policyReady && Boolean(settings.defaultModelId ?? settings.enabledModelIds[0]);
  return c.json({
    tenant: row ?? { name: "Unknown", slug: "unknown" },
    stats: {
      users: Number(s?.users ?? 0),
      threads: Number(s?.threads ?? 0),
      messages: Number(s?.messages ?? 0),
      auditEvents: Number(s?.audits ?? 0),
    },
    enabledModels,
    providerConnected,
    workspaceReady,
    provider: {
      connected: Object.values(allProviders.providers)
        .filter((p) => p.configured)
        .map((p) => ({ label: p.label, keyHint: p.keyHint })),
      catalogCount: available.models.length,
      error: available.providerError ?? null,
    },
    policy: {
      profile: settings.dlp.profile,
      enabledModelCount: settings.enabledModelIds.length,
      defaultModelId: settings.defaultModelId,
      allowAttachments: settings.uploads.allowAttachments,
      quotasEnforced: settings.quotas.enforce,
      conversationReview: settings.adminMask.chatContentAccess,
    },
    usage: {
      periodMonth: usage.periodMonth,
      orgMessages: usage.orgMessages,
      orgAttachmentMb: Math.round(usage.orgAttachmentBytes / (1024 * 1024)),
    },
    privacy: {
      protectedMessages: Number(protectedMessages.rows[0]?.count ?? 0),
      valuesWithheld: privacy.rows.reduce((sum, r) => sum + Number(r.count), 0),
      byCategory: privacy.rows.map((r) => ({
        group: r.group,
        label: r.label,
        count: Number(r.count),
      })),
    },
  });
  } catch (error) {
    console.error("[stoa] admin overview", error);
    return c.json(
      {
        error: "The overview could not be loaded. Try again in a moment.",
      },
      500,
    );
  }
});

adminRoutes.get("/usage", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  try {
    const settings = await getTenantSettings(tenantId);
    const usage = await getUsageSnapshot(tenantId, userId);
    const trackingReady = await usageTrackingReady();
    const pool = getPool();

    type UserRow = {
      id: string;
      external_id: string;
      display_name: string | null;
      thread_count: string;
      message_count: string;
      attachment_bytes: string;
      created_at: Date;
    };

    let userRows: UserRow[];
    if (trackingReady) {
      const users = await pool.query<UserRow>(
        `SELECT u.id, u.external_id, u.display_name, u.created_at,
                (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count,
                COALESCE(um.message_count, 0)::text AS message_count,
                COALESCE(um.attachment_bytes, 0)::text AS attachment_bytes
         FROM stoa_user u
         LEFT JOIN stoa_usage_monthly um
           ON um.user_id = u.id
          AND um.tenant_id = u.tenant_id
          AND um.period_month = $2::date
         WHERE u.tenant_id = $1
         ORDER BY COALESCE(um.message_count, 0) DESC, u.created_at ASC`,
        [tenantId, usage.periodMonth],
      );
      userRows = users.rows;
    } else {
      const users = await pool.query<UserRow>(
        `SELECT u.id, u.external_id, u.display_name, u.created_at,
                (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count,
                '0'::text AS message_count,
                '0'::text AS attachment_bytes
         FROM stoa_user u
         WHERE u.tenant_id = $1
         ORDER BY u.created_at ASC`,
        [tenantId],
      );
      userRows = users.rows;
    }

    return c.json({
      periodMonth: usage.periodMonth,
      usage: {
        orgMessages: usage.orgMessages,
        orgAttachmentBytes: usage.orgAttachmentBytes,
      },
      quotas: settings.quotas,
      trackingReady,
      ...(trackingReady
        ? {}
        : {
            notice: "Usage data is unavailable.",
          }),
      users: userRows.map((u) => ({
        id: u.id,
        email: u.external_id,
        displayName: u.display_name,
        threadCount: Number(u.thread_count),
        messageCount: Number(u.message_count),
        attachmentBytes: Number(u.attachment_bytes),
        createdAt: u.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[stoa] admin usage", error);
    if (isPgMissingRelation(error, "stoa_usage_monthly")) {
      return c.json(
        { error: "Usage data is unavailable." },
        503,
      );
    }
    return c.json({ error: "Failed to load usage." }, 500);
  }
});

adminRoutes.get("/users", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  try {
    const result = await getPool().query<{
      id: string;
      external_id: string;
      display_name: string | null;
      created_at: Date;
      site_id: string | null;
      site_name: string | null;
      thread_count: string;
    }>(
      `SELECT u.id, u.external_id, u.display_name, u.created_at, u.site_id,
              s.name AS site_name,
              (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count
       FROM stoa_user u
       LEFT JOIN stoa_site s ON s.id = u.site_id
       WHERE u.tenant_id = $1
       ORDER BY u.created_at DESC`,
      [tenantId],
    );
    return c.json({
      users: result.rows.map((u) => ({
        id: u.id,
        email: u.external_id,
        externalId: u.external_id,
        displayName: u.display_name,
        createdAt: u.created_at.toISOString(),
        threadCount: Number(u.thread_count),
        siteId: u.site_id,
        siteName: u.site_name,
      })),
    });
  } catch (error) {
    if (!isPgMissingRelation(error, "stoa_site")) {
      throw error;
    }
    const result = await getPool().query<{
      id: string;
      external_id: string;
      display_name: string | null;
      created_at: Date;
      thread_count: string;
    }>(
      `SELECT u.id, u.external_id, u.display_name, u.created_at,
              (SELECT COUNT(*)::text FROM stoa_thread t WHERE t.user_id = u.id) AS thread_count
       FROM stoa_user u
       WHERE u.tenant_id = $1
       ORDER BY u.created_at DESC`,
      [tenantId],
    );
    return c.json({
      users: result.rows.map((u) => ({
        id: u.id,
        email: u.external_id,
        externalId: u.external_id,
        displayName: u.display_name,
        createdAt: u.created_at.toISOString(),
        threadCount: Number(u.thread_count),
        siteId: null,
        siteName: null,
      })),
    });
  }
});

adminRoutes.route("/", adminExtendedRoutes);
adminRoutes.route("/", adminComplianceRoutes);
adminRoutes.route("/", adminGatewayRoutes);

adminRoutes.get("/providers", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const status = await getAllProviderStatus(tenantId);
  return c.json({
    ...status,
    note: "Keys are encrypted in your database. Requests go directly from your deployment to each provider.",
  });
});

function parseProviderKind(raw: string): ProviderKind | null {
  if (raw in PROVIDER_META) {
    return raw as ProviderKind;
  }
  return null;
}

adminRoutes.patch("/providers/:kind", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const kind = parseProviderKind(c.req.param("kind"));
  if (!kind) {
    return c.json({ error: "Unknown provider" }, 400);
  }
  const { tenantId, userId } = c.get("stoa");
  const body = await c.req.json<{
    apiKey?: string;
    baseUrl?: string;
    clearKey?: boolean;
  }>();
  const status = await updateProviderConnection(tenantId, kind, body);
  invalidateTenantModelsCache(tenantId);
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.providers.updated', $3::jsonb)`,
    [
      tenantId,
      userId,
      JSON.stringify({ provider: kind, configured: status.providers[kind].configured }),
    ],
  );
  return c.json(status);
});

adminRoutes.post("/providers/:kind/test", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const kind = parseProviderKind(c.req.param("kind"));
  if (!kind) {
    return c.json({ error: "Unknown provider" }, 400);
  }
  const { tenantId } = c.get("stoa");
  let body: { apiKey?: string; baseUrl?: string } = {};
  try {
    body = await c.req.json<{ apiKey?: string; baseUrl?: string }>();
  } catch {
    body = {};
  }
  const stored = await getAllProviderStatus(tenantId);
  const baseDefault = stored.providers[kind].baseUrl;
  const probeKey = body.apiKey?.trim();
  const access =
    probeKey && probeKey.length > 0
      ? {
          apiKey: probeKey,
          baseUrl: body.baseUrl?.trim().replace(/\/$/, "") ?? baseDefault,
        }
      : await getProviderConnection(tenantId, kind);
  if (!access) {
    return c.json({
      ok: false,
      error: "Enter an API key.",
    });
  }
  const result = await discoverModelsForKind(kind, access);
  if (result.error) {
    return c.json({ ok: false, error: result.error, provider: kind });
  }
  return c.json({
    ok: true,
    provider: kind,
    modelCount: result.models.length,
    sampleModelIds: result.models.slice(0, 5).map((m) => m.id),
    models: result.models,
  });
});

adminRoutes.get("/providers/models", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const result = await discoverAllTenantModels(tenantId);
  return c.json({
    models: result.models,
    source: result.anyConfigured ? "tenant" : "none",
    errors: result.errors,
  });
});

adminRoutes.patch("/providers/openai", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId, userId } = c.get("stoa");
  const body = await c.req.json<{
    apiKey?: string;
    baseUrl?: string;
    clearKey?: boolean;
  }>();
  const status = await updateOpenAiProvider(tenantId, body);
  invalidateTenantModelsCache(tenantId);
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
     VALUES ($1, $2, 'admin.providers.updated', $3::jsonb)`,
    [
      tenantId,
      userId,
      JSON.stringify({
        openaiConfigured: status.openai.configured,
        baseUrl: status.openai.baseUrl,
      }),
    ],
  );
  return c.json({ providers: status });
});

adminRoutes.post("/providers/openai/test", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  let body: { apiKey?: string; baseUrl?: string } = {};
  try {
    body = await c.req.json<{ apiKey?: string; baseUrl?: string }>();
  } catch {
    body = {};
  }
  const probeKey = body.apiKey?.trim();
  const probe =
    probeKey && probeKey.length > 0
      ? {
          apiKey: probeKey,
          baseUrl:
            body.baseUrl?.trim().replace(/\/$/, "") ??
            (await resolveTenantGatewayAccess(tenantId))?.baseUrl ??
            "https://api.openai.com",
        }
      : undefined;
  const result = await discoverGatewayModels(tenantId, probe);
  if (result.source === "none") {
    return c.json({
      ok: false,
      error: "Enter an API key.",
    });
  }
  if (result.error) {
    return c.json({
      ok: false,
      error: result.error,
      source: result.source,
    });
  }
  return c.json({
    ok: true,
    source: result.source,
    modelCount: result.models.length,
    sampleModelIds: result.models.slice(0, 5).map((m) => m.id),
    models: result.models,
  });
});

adminRoutes.get("/providers/openai/models", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const result = await discoverGatewayModels(tenantId);
  return c.json({
    models: result.models,
    source: result.source,
    error: result.error ?? null,
  });
});

adminRoutes.get("/audit", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const limit = Math.min(
    200,
    Math.max(1, Math.floor(Number(c.req.query("limit"))) || 50),
  );
  const offset = Math.max(0, Math.floor(Number(c.req.query("offset"))) || 0);
  const pool = getPool();
  const [result, countResult] = await Promise.all([
    pool.query<{
      id: string;
      event_type: string;
      metadata: Record<string, unknown>;
      created_at: Date;
      user_email: string | null;
    }>(
      `SELECT e.id, e.event_type, e.metadata, e.created_at, u.external_id AS user_email
       FROM stoa_audit_event e
       LEFT JOIN stoa_user u ON u.id = e.user_id
       WHERE e.tenant_id = $1
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stoa_audit_event WHERE tenant_id = $1`,
      [tenantId],
    ),
  ]);
  return c.json({
    events: result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      userEmail: row.user_email,
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
    limit,
    offset,
  });
});

adminRoutes.get("/settings", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const settings = await getTenantSettings(tenantId);
  const [available, enabledModels, providerStatus] = await Promise.all([
    getAvailableModelsForTenant(tenantId),
    getEnabledModelsForTenant(tenantId),
    getAllProviderStatus(tenantId),
  ]);
  return c.json({
    availableModels: available.models,
    providerSource: available.source,
    providerConfigured: providerStatus.anyConfigured,
    providerError: available.providerError ?? null,
    providerErrors: available.providerErrors ?? {},
    settings: withoutSecrets(settings),
    enabledModels,
  });
});

function withoutSecrets(settings: Awaited<ReturnType<typeof getTenantSettings>>) {
  const { siemWebhookSecret, exportSigningSecret, ...compliance } =
    settings.compliance;
  const { smtpPassword, ...email } = settings.email;
  return {
    ...settings,
    compliance: {
      ...compliance,
      siemWebhookSecret: null,
      exportSigningSecret: null,
      siemWebhookSecretSet: Boolean(siemWebhookSecret),
      exportSigningSecretSet: Boolean(exportSigningSecret),
    },
    email: {
      ...email,
      smtpPassword: null,
      smtpPasswordSet: Boolean(smtpPassword),
    },
  };
}

const DLP_PREVIEW_MAX_CHARS = 20_000;

adminRoutes.post("/dlp/preview", async (c) => {
  if (!(await requireOrgRead(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const body = await c.req
    .json<{ text?: unknown; dlp?: Record<string, unknown> }>()
    .catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return c.json({ error: "Enter a message to test." }, 400);
  }
  if (text.length > DLP_PREVIEW_MAX_CHARS) {
    return c.json(
      { error: `Test messages are limited to ${DLP_PREVIEW_MAX_CHARS} characters.` },
      400,
    );
  }
  const saved = await getTenantSettings(tenantId);
  const dlp = normalizeDlp({ ...saved.dlp, ...(body?.dlp ?? {}) });
  const result = await redactForUpstream(text, {
    profile: dlp.profile,
    customTerms: dlp.customTerms,
    customPatterns: dlp.customPatterns,
  });
  const orgDomains = await getOrgEmailDomains(tenantId);
  return c.json({
    upstream: result.text,
    redactionCount: result.redactionCount,
    manifest: result.manifest,
    items: result.items.map((item) => ({
      token: item.token,
      value: item.value,
      label: manifestGroupLabel(item.group),
      modelHint: describePlaceholder(item.token, item.value, { orgDomains }),
    })),
  });
});

adminRoutes.patch("/settings", async (c) => {
  if (!(await requireOrgWrite(c))) {
    return adminAccessForbidden(c, "You don't have permission to do this.");
  }
  const { tenantId } = c.get("stoa");
  const body = await c.req.json<{
    enabledModelIds?: string[];
    defaultModelId?: string | null;
    dlp?: {
      profile?: "standard" | "financial" | "strict";
      customTerms?: string[];
      customPatterns?: {
        id: string;
        label: string;
        regex: string;
        token: string;
        enabled: boolean;
      }[];
    };
    adminMask?: {
      chatContentAccess?: "metadata" | "redacted" | "full";
    };
    uploads?: {
      allowAttachments?: boolean;
      maxFileMb?: number;
      allowedMimeTypes?: string[];
    };
    quotas?: {
      enforce?: boolean;
      maxMessagesPerUserMonth?: number;
      maxMessagesOrgMonth?: number;
      maxAttachmentMbPerOrgMonth?: number;
    };
    retention?: {
      enforce?: boolean;
      messageRetentionDays?: number | null;
      threadRetentionDays?: number | null;
      attachmentRetentionDays?: number | null;
      scheduleEnabled?: boolean;
      scheduleUtcHour?: number;
    };
    compliance?: {
      siemWebhookUrl?: string | null;
      siemWebhookSecret?: string | null;
      siemNotifyOnRetentionRun?: boolean;
      siemStreamAuditEvents?: boolean;
      exportSigningSecret?: string | null;
    };
    email?: {
      fromName?: string | null;
      fromAddress?: string | null;
      replyTo?: string | null;
      delivery?: "platform" | "smtp";
      smtpHost?: string | null;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string | null;
      smtpPassword?: string | null;
    };
  }>();
  try {
    const available = await getAvailableModelsForTenant(tenantId);
    const allowedIds = new Set(available.models.map((m) => m.id));
    let enabledModelIds = body.enabledModelIds;
    if (enabledModelIds) {
      if (enabledModelIds.length > 0 && allowedIds.size === 0) {
        return c.json(
          { error: "Couldn't load models. Check the connection in Providers." },
          503,
        );
      }
      enabledModelIds = enabledModelIds.filter((id) => allowedIds.has(id));
      if (enabledModelIds.length === 0 && available.models.length > 0) {
        return c.json(
          { error: "Choose at least one model." },
          400,
        );
      }
    }
    const settings = await updateTenantSettings(tenantId, {
      enabledModelIds,
      defaultModelId: body.defaultModelId,
      dlp: body.dlp,
      adminMask: body.adminMask,
      uploads: body.uploads,
      quotas: body.quotas,
      retention: body.retention,
      compliance: body.compliance,
      email: body.email,
    });
    invalidateSiemSettingsCache(tenantId);
    await getPool().query(
      `INSERT INTO stoa_audit_event (tenant_id, user_id, event_type, metadata)
       VALUES ($1, $2, 'admin.settings.updated', $3::jsonb)`,
      [
        tenantId,
        c.get("stoa").userId,
        JSON.stringify({
          enabledModelIds: settings.enabledModelIds,
          defaultModelId: settings.defaultModelId,
          dlp: settings.dlp,
        }),
      ],
    );
    const [freshAvailable, providerStatus] = await Promise.all([
      getAvailableModelsForTenant(tenantId),
      getAllProviderStatus(tenantId),
    ]);
    return c.json({
      availableModels: freshAvailable.models,
      providerSource: freshAvailable.source,
      providerConfigured: providerStatus.anyConfigured,
      providerError: freshAvailable.providerError ?? null,
      providerErrors: freshAvailable.providerErrors ?? {},
      settings: withoutSecrets(settings),
      enabledModels: await getEnabledModelsForTenant(tenantId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  }
});
