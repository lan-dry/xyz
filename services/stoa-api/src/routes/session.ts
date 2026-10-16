import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { getEnabledModelsForTenant } from "../tenant/model-access.js";
import { resolveAdminConsoleAccess } from "../auth/admin-access.js";
import { getTenantSettings } from "../tenant/settings.js";
import { buildWorkspaceDlpPublicSummary } from "../dlp/public-summary.js";
import { resolveWorkspaceChatStatus } from "../tenant/workspace-chat-status.js";

export const sessionRoutes = new Hono();

sessionRoutes.get("/me", async (c) => {
  const ctx = c.get("stoa");
  const tenant = await getPool().query<{ slug: string; name: string }>(
    `SELECT slug, name FROM stoa_tenant WHERE id = $1`,
    [ctx.tenantId],
  );
  const settings = await getTenantSettings(ctx.tenantId);
  const workspaceChat = await resolveWorkspaceChatStatus(ctx.tenantId);
  const adminAccess = await resolveAdminConsoleAccess(ctx);
  const row = tenant.rows[0];
  return c.json({
    authMode: ctx.authMode,
    role: adminAccess.role,
    isAdmin: adminAccess.canAccessConsole,
    adminConsole: {
      canAccess: adminAccess.canAccessConsole,
      canWrite: adminAccess.canWriteOrg,
      readOnly: adminAccess.readOnlyOrg,
      siteManagerOnly: adminAccess.siteManagerOnly,
      managedSiteIds: adminAccess.managedSiteIds,
    },
    organizationId: ctx.session?.organizationId ?? null,
    user: {
      id: ctx.userId,
      email: ctx.userExternalId,
      displayName: ctx.session?.displayName ?? ctx.userExternalId,
    },
    tenant: row
      ? { slug: row.slug, name: row.name }
      : { slug: "unknown", name: "Unknown" },
    workspacePolicy: {
      allowAttachments: settings.uploads.allowAttachments,
      maxFileMb: settings.uploads.maxFileMb,
      quotasEnforced: settings.quotas.enforce,
    },
    workspaceChat,
    workspaceDlp: buildWorkspaceDlpPublicSummary(settings.dlp),
  });
});

sessionRoutes.get("/models", async (c) => {
  const { tenantId } = c.get("stoa");
  const enabled = await getEnabledModelsForTenant(tenantId);
  return c.json({
    models: enabled,
  });
});
