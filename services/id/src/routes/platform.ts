import { getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import {
  getPlanCatalog,
  hashPassword,
  ImpersonationError,
  isPlatformRole,
  platformGetAccount,
  platformListAccountsPaginated,
  platformListAuditLogs,
  platformListOrganizations,
  platformOverviewStats,
  platformResetAccountPassword,
  platformSetAccountActive,
  platformSetMembershipStatus,
  platformUpdateOrganization,
  PlatformRoleError,
  provisionOrganization,
  resolvePlatformStaffSession,
  SALANOR_SESSION_COOKIE,
  sessionHasPlatformPermission,
  setAccountPlatformRole,
  startImpersonation,
  type PlatformPermission,
  type PlatformStaffSession,
  updatePlanCatalogRow,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";
import {
  listContactLeads,
  updateContactLead,
  type LeadStatus,
} from "../lib/contact-leads.js";

export const platformRoutes = new Hono();

function platformSecretOk(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const expected = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const provided =
    c.req.header("x-platform-secret") ?? c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === expected;
}

type AccessResult =
  | { ok: true; staff: PlatformStaffSession | null; bootstrap: boolean }
  | { ok: false; error: "Forbidden" };

/** Bootstrap secret = full access. Human session must hold the permission. */
async function requirePlatformPermission(
  c: { req: { header: (n: string) => string | undefined } },
  permission: PlatformPermission,
): Promise<AccessResult> {
  if (platformSecretOk(c)) {
    return { ok: true, staff: null, bootstrap: true };
  }
  const token = getCookie(c as Parameters<typeof getCookie>[0], SALANOR_SESSION_COOKIE);
  const staff = await resolvePlatformStaffSession(getPool(), token);
  if (!staff) {
    return { ok: false, error: "Forbidden" };
  }
  if (!sessionHasPlatformPermission(staff, permission)) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, staff, bootstrap: false };
}

platformRoutes.get("/session", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  if (access.bootstrap || !access.staff) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json({
    staff: true,
    email: access.staff.email,
    display_name: access.staff.displayName,
    account_id: access.staff.accountId,
    platform_role: access.staff.platform_role,
  });
});

platformRoutes.post("/organizations", async (c) => {
  const access = await requirePlatformPermission(c, "platform:provision");
  if (!access.ok) return c.json({ error: access.error }, 403);

  let body: {
    name?: string;
    slug?: string;
    admin_email?: string;
    admin_display_name?: string;
    admin_password?: string;
    plan?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (!body.name?.trim() || !body.slug?.trim() || !body.admin_email?.trim()) {
    return c.json({ error: "name, slug, and admin_email required" }, 422);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await provisionOrganization(client, {
      name: body.name,
      slug: body.slug,
      adminEmail: body.admin_email,
      adminDisplayName: body.admin_display_name?.trim() || null,
      adminPasswordHash: body.admin_password
        ? hashPassword(body.admin_password)
        : null,
      plan: body.plan,
    });
    await client.query("COMMIT");
    return c.json({
      organization_id: result.organization_id,
      admin_email: body.admin_email.trim().toLowerCase(),
      membership_id: result.membership_id,
      plan: body.plan?.trim().toLowerCase() || "free",
      default_agent: result.default_agent,
      sdk_config: {
        organization_id: result.default_agent.organization_id,
        organization_slug: result.default_agent.organization_slug,
        agent_id: result.default_agent.agent_id,
        key_id: result.default_agent.key_id,
        private_key_b64: result.default_agent.private_key_b64,
      },
      message: body.admin_password
        ? "Organization, admin account, and default agent are ready. Copy default_agent.private_key_b64 now — shown once."
        : "Organization and default agent created. Copy private_key_b64 now; invite admin via Members if no password was set.",
    });
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return c.json({ error: "Organization slug or admin already exists" }, 409);
    }
    const message = err instanceof Error ? err.message : "Failed to provision organization";
    if (message.startsWith("Invalid plan:")) {
      return c.json({ error: message }, 422);
    }
    console.error("[id] provision org", err);
    return c.json({ error: "Failed to provision organization" }, 500);
  } finally {
    client.release();
  }
});

platformRoutes.get("/organizations", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const q = c.req.query("q");
  const orgs = await platformListOrganizations(getPool(), q);
  return c.json({ organizations: orgs });
});

platformRoutes.patch("/organizations/:organizationId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  let body: { plan?: string; active?: boolean; plan_overrides?: Record<string, unknown> | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (body.plan) {
    const planOk = await getPool().query(
      `SELECT 1 FROM plan_catalog WHERE plan_slug = $1 AND active`,
      [body.plan],
    );
    if (!planOk.rows[0]) {
      return c.json({ error: "Invalid plan" }, 422);
    }
  }
  const ok = await platformUpdateOrganization(getPool(), organizationId, {
    plan: body.plan,
    active: body.active,
    plan_overrides: body.plan_overrides,
  });
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

platformRoutes.get("/overview/stats", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const stats = await platformOverviewStats(getPool());
  return c.json({ stats });
});

platformRoutes.get("/audit-logs", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const limit = Number(c.req.query("limit") || "50");
  const offset = Number(c.req.query("offset") || "0");
  const result = await platformListAuditLogs(getPool(), { limit, offset });
  return c.json({
    logs: result.logs.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
    })),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
});

platformRoutes.get("/accounts", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const q = c.req.query("q");
  const limit = Number(c.req.query("limit") || "25");
  const offset = Number(c.req.query("offset") || "0");
  const result = await platformListAccountsPaginated(getPool(), { query: q, limit, offset });
  return c.json({
    accounts: result.accounts.map((a) => ({
      ...a,
      created_at: a.created_at.toISOString(),
      updated_at: a.updated_at.toISOString(),
    })),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
});

platformRoutes.get("/accounts/:accountId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const account = await platformGetAccount(getPool(), c.req.param("accountId"));
  if (!account) return c.json({ error: "Not found" }, 404);
  return c.json({
    account: {
      ...account,
      created_at: account.created_at.toISOString(),
      updated_at: account.updated_at.toISOString(),
    },
  });
});

platformRoutes.patch("/accounts/:accountId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:accounts.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const accountId = c.req.param("accountId");
  let body: { active?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (body.active === undefined) {
    return c.json({ error: "active required" }, 422);
  }
  const ok = await platformSetAccountActive(getPool(), accountId, body.active);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

platformRoutes.patch("/accounts/:accountId/platform-role", async (c) => {
  const access = await requirePlatformPermission(c, "platform:roles.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  if (access.bootstrap || !access.staff) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accountId = c.req.param("accountId");
  let body: { platform_role?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!("platform_role" in body)) {
    return c.json({ error: "platform_role required (superadmin | admin | staff | null)" }, 422);
  }
  const role = body.platform_role;
  if (role !== null && role !== undefined && !isPlatformRole(role)) {
    return c.json({ error: "Invalid platform_role" }, 422);
  }

  try {
    const updated = await setAccountPlatformRole(getPool(), {
      accountId,
      platformRole: role ?? null,
      actorAccountId: access.staff.accountId,
      actorPlatformRole: access.staff.platform_role,
    });
    return c.json({ ok: true, platform_role: updated.platform_role });
  } catch (err) {
    if (err instanceof PlatformRoleError) {
      return c.json({ error: err.message }, 422);
    }
    throw err;
  }
});

platformRoutes.patch("/memberships/:membershipId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:accounts.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const membershipId = c.req.param("membershipId");
  let body: { status?: "active" | "suspended" };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.status) {
    return c.json({ error: "status required" }, 422);
  }
  const ok = await platformSetMembershipStatus(getPool(), membershipId, body.status);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

platformRoutes.post("/accounts/:accountId/reset-password", async (c) => {
  const access = await requirePlatformPermission(c, "platform:accounts.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const accountId = c.req.param("accountId");
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.password || body.password.length < 8) {
    return c.json({ error: "password min 8 characters required" }, 422);
  }
  const ok = await platformResetAccountPassword(
    getPool(),
    accountId,
    hashPassword(body.password),
  );
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

platformRoutes.get("/plan-catalog", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const plans = await getPlanCatalog(getPool(), false);
  return c.json({ plans });
});

platformRoutes.patch("/plan-catalog/:planSlug", async (c) => {
  const access = await requirePlatformPermission(c, "platform:plans.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const planSlug = c.req.param("planSlug");
  let body: {
    display_name?: string;
    events_per_month?: number | null;
    max_ingest_keys?: number;
    max_members?: number;
    retention_days?: number;
    self_serve?: boolean;
    active?: boolean;
    stripe_price_id?: string | null;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const row = await updatePlanCatalogRow(getPool(), planSlug, body);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ plan: row });
});

platformRoutes.get("/contact-leads", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);

  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20), 1), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const q = c.req.query("q")?.trim();
  const reason = c.req.query("reason")?.trim();
  const statusRaw = c.req.query("status")?.trim();
  const allowed = new Set(["new", "contacted", "qualified", "closed", "spam"]);
  const status =
    statusRaw && allowed.has(statusRaw) ? (statusRaw as LeadStatus) : undefined;

  const result = await listContactLeads(getPool(), {
    limit,
    offset,
    q,
    reason,
    status,
  });

  return c.json({
    leads: result.leads,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    stats: result.stats,
    source: result.source,
  });
});

platformRoutes.patch("/contact-leads/:leadId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  if (!access.staff?.email) {
    return c.json({ error: "Staff session required" }, 403);
  }

  const leadId = c.req.param("leadId");
  let body: { status?: string; notes?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const allowed = new Set(["new", "contacted", "qualified", "closed", "spam"]);
  const patch: { status?: LeadStatus; notes?: string } = {};
  if (typeof body.status === "string" && allowed.has(body.status)) {
    patch.status = body.status as LeadStatus;
  }
  if (typeof body.notes === "string") {
    patch.notes = body.notes.slice(0, 8000);
  }
  if (!patch.status && patch.notes === undefined) {
    return c.json({ error: "No valid fields to update" }, 422);
  }

  const lead = await updateContactLead(getPool(), leadId, patch, access.staff.email);
  if (!lead) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, lead });
});

platformRoutes.post("/organizations/:organizationId/impersonate", async (c) => {
  const access = await requirePlatformPermission(c, "platform:impersonate");
  if (!access.ok) return c.json({ error: access.error }, 403);
  if (access.bootstrap || !access.staff) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organizationId = c.req.param("organizationId");
  try {
    const result = await startImpersonation(getPool(), {
      currentToken: token,
      organizationId,
      actorAccountId: access.staff.accountId,
      actorPlatformRole: access.staff.platform_role,
    });
    const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
    return c.json({
      ok: true,
      handoff_token: result.token,
      redirect_url: `${consoleOrigin}/aegis`,
      organization: result.organization,
      effective_role: result.session.role,
    });
  } catch (err) {
    if (err instanceof ImpersonationError) {
      return c.json({ error: err.message }, 422);
    }
    throw err;
  }
});
