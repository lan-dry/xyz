import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import {
  DemoIngestKeyError,
  DemoTenantRefusal,
  getPlanCatalog,
  getPlatformEmailSettings,
  hashPassword,
  PlatformEmailSettingsError,
  resolvePlatformEmailDelivery,
  savePlatformEmailSettings,
  platformSetStableIngestKey,
  ImpersonationError,
  isPlatformRole,
  platformAssertDemoOrTest,
  platformGetAccount,
  platformListAccountsPaginated,
  platformListAuditLogs,
  platformListDemoTenantAudit,
  platformListDemoTenants,
  platformListDistinctAuditActions,
  platformListWorkerRuns,
  platformListOrganizations,
  platformGetOrganization,
  platformOverviewStats,
  platformRecordDemoTenantAction,
  platformResetAccountPassword,
  platformSetAccountActive,
  platformSetMembershipStatus,
  platformUpdateOrganization,
  listOrganizationBillingEvents,
  recordOrganizationBillingPending,
  markOrganizationBillingPaid,
  endOrganizationBilling,
  writePlatformAuditEvent,
  PlatformRoleError,
  provisionOrganization,
  platformEnsureOrganizationMember,
  requireConfirmSlug,
  InviteError,
  resolvePlatformStaffSession,
  SALANOR_SESSION_COOKIE,
  sessionHasPlatformPermission,
  setAccountPlatformRole,
  startImpersonation,
  PlanLimitError,
  type OrgRole,
  type PlatformPermission,
  type PlatformStaffSession,
  updatePlanCatalogRow,
} from "@salanor/platform-auth";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath, resolve as resolvePath } from "node:path";
import pg from "pg";
import {
  EmailDeliveryError,
  sendTransactionalEmail,
} from "../email/email-delivery.js";
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
    is_demo?: boolean;
    is_test?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  if (!body.name?.trim() || !body.slug?.trim() || !body.admin_email?.trim()) {
    return c.json({ error: "name, slug, and admin_email required" }, 422);
  }

  // Disposable test tenants (wipeable, migration 020): explicit flag, or a smoke-test slug
  // (the runbook requires smoke slugs to contain "smoke"). Platform provisioning only:
  // self-serve signup never sets this, so a customer cannot make their own tenant wipeable.
  const isTest = body.is_test === true || /smoke/i.test(body.slug);

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
      isDemo: body.is_demo === true,
      isTest,
    });
    await client.query("COMMIT");
    return c.json({
      organization_id: result.organization_id,
      admin_email: body.admin_email.trim().toLowerCase(),
      membership_id: result.membership_id,
      plan: body.plan?.trim().toLowerCase() || "free",
      is_demo: body.is_demo === true,
      is_test: isTest,
      default_agent: result.default_agent,
      sdk_config: {
        organization_id: result.default_agent.organization_id,
        organization_slug: result.default_agent.organization_slug,
        agent_id: result.default_agent.agent_id,
        key_id: result.default_agent.key_id,
        private_key_b64: result.default_agent.private_key_b64,
      },
      message: body.admin_password
        ? "Organization, admin account, and default agent are ready. Copy default_agent.private_key_b64 now. It is shown only once."
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
    // Return the real cause (missing column, FK, etc.) so laptop provision is actionable.
    return c.json({ error: message }, 500);
  } finally {
    client.release();
  }
});

platformRoutes.get("/organizations", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const q = c.req.query("q");
  try {
    const orgs = await platformListOrganizations(getPool(), q);
    return c.json({
      organizations: orgs.map((o) => ({
        ...o,
        created_at: new Date(o.created_at).toISOString(),
        current_period_start: o.current_period_start
          ? new Date(o.current_period_start).toISOString()
          : null,
        current_period_end: o.current_period_end
          ? new Date(o.current_period_end).toISOString()
          : null,
      })),
    });
  } catch (err) {
    console.error("[id] platform list organizations", err);
    const message = err instanceof Error ? err.message : "Failed to list organizations";
    // Surface the DB/driver message so laptop provision can show the real cause
    // (e.g. missing is_demo) instead of a blank Internal Server Error.
    return c.json({ error: message }, 500);
  }
});

function demoActor(access: Extract<AccessResult, { ok: true }>): string {
  if (access.bootstrap) return "platform:bootstrap";
  return `ops:${access.staff?.email ?? "unknown"}`;
}

/** Persist a refuse audit row when Ops targets a non–demo/test tenant. */
async function auditDemoTenantRefusal(
  access: Extract<AccessResult, { ok: true }>,
  slug: string,
  requested: "wipe" | "create" | "load_history" | "reset" | "populate",
): Promise<void> {
  try {
    await platformRecordDemoTenantAction(getPool(), {
      slug,
      // SQL allowlist is wipe|create|load_history|reset|refuse — always record refuse.
      action: "refuse",
      actor: demoActor(access),
      result: { requested_action: requested },
      requireDemoOrTest: true,
    });
  } catch {
    /* recorded by SQL, or org missing */
  }
}

function runDemoCli(
  scriptRel: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  // ID service lives at services/id; repo root is three levels up from routes/.
  const repoRoot = resolvePath(import.meta.dirname, "../../../..");
  // Prefer compiled JS (Railway id image); fall back to tsx for local `pnpm --filter id dev`.
  const distMjs = resolvePath(
    repoRoot,
    scriptRel
      .replace(/^tools\/demo\//, "tools/demo/dist/")
      .replace(/\.mts$/, ".mjs"),
  );
  const sourceMts = resolvePath(repoRoot, scriptRel);
  const useDist = existsSync(distMjs);
  if (!useDist && !existsSync(sourceMts)) {
    return Promise.resolve({
      code: 1,
      stdout: "",
      stderr:
        `Demo CLI missing: ${distMjs} (and ${sourceMts}). ` +
        "Rebuild the id image with tools/demo, or run provision from the aegis-api shell / laptop.",
    });
  }
  const cmd = useDist
    ? process.execPath
    : process.platform === "win32"
      ? "pnpm.cmd"
      : "pnpm";
  const cmdArgs = useDist
    ? [distMjs, ...args]
    : ["exec", "tsx", sourceMts, ...args];
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}\nspawn failed: ${err.message}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** Prefer env; else the gitignored local-stack file written by demo:fresh. */
function resolveDemoIngestKey(): string | undefined {
  const fromEnv =
    process.env.DEMO_BANK_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const repoRoot = resolvePath(import.meta.dirname, "../../../..");
    const path = resolvePath(repoRoot, ".demo-tenant-local-stack.local.json");
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { ingest_key?: string };
    return parsed.ingest_key?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ops Populate must always have an ingest secret for provision + seed-history.
 * Prefer tenant JSON `ingest_key`, then DEMO_BANK_INGEST_KEY on salanor-id,
 * else mint one for this request (same pattern as demo:fresh).
 */
function demoPopulateIngestKey(fromTenant?: string): { key: string; minted: boolean } {
  const candidate = fromTenant?.trim() || resolveDemoIngestKey();
  if (candidate) {
    if (candidate.length < 32 || /\s/.test(candidate)) {
      throw new Error(
        "ingest_key / DEMO_BANK_INGEST_KEY must be at least 32 characters with no whitespace",
      );
    }
    return { key: candidate, minted: false };
  }
  return { key: `aegis_${randomBytes(24).toString("hex")}`, minted: true };
}

/** Env for provision + seed so both share one ingest secret after wipe. */
function demoPopulateCliEnv(
  slug: string,
  name: string,
  tenantFilePath: string | undefined,
  ingestKey: string,
): Record<string, string | undefined> {
  // Railway salanor-id runs as `node` and often cannot mkdir under /app; keep
  // connector private keys in tmp for Ops Populate / seed-history.
  const connectorsDir =
    process.env.AEGIS_CONNECTORS_DIR?.trim() ||
    joinPath(tmpdir(), "salanor-demo-connectors");
  return {
    DEMO_ORG_SLUG: slug,
    DEMO_ORG_NAME: name,
    DEMO_ORG_IS_DEMO: "1",
    DEMO_ORG_IS_TEST: "1",
    DEMO_TENANT_SLUG: slug,
    ...(tenantFilePath ? { DEMO_TENANT_FILE: tenantFilePath } : {}),
    AEGIS_INGEST_KEY: ingestKey,
    DEMO_BANK_INGEST_KEY: ingestKey,
    AEGIS_CONNECTORS_DIR: connectorsDir,
  };
}

type ParsedDemoTenant = {
  api_base?: string;
  id_base?: string;
  ingest_key?: string;
  personas?: Record<
    string,
    { email?: string; display_name?: string; password?: string } | undefined
  >;
};

type TenantFileHandle = {
  path: string;
  cleanup: () => void;
  adminEmail: string;
  adminDisplayName: string;
  adminPassword: string;
  personaEmails: string[];
  ingestKey?: string;
};

function parseDemoTenantRaw(raw: string): Omit<TenantFileHandle, "path" | "cleanup"> {
  let parsed: ParsedDemoTenant;
  try {
    parsed = JSON.parse(raw) as ParsedDemoTenant;
  } catch {
    throw new Error("tenant_json is not valid JSON");
  }
  if (!parsed.api_base?.trim() || !parsed.id_base?.trim()) {
    throw new Error("tenant_json needs api_base and id_base");
  }
  const admin = parsed.personas?.admin;
  if (!admin?.email?.trim() || !admin.password) {
    throw new Error("tenant_json needs personas.admin.email and personas.admin.password");
  }
  if (admin.password.length < 10) {
    throw new Error("personas.admin.password must be at least 10 characters");
  }
  const ingestKey = parsed.ingest_key?.trim() || undefined;
  if (ingestKey && (ingestKey.length < 32 || /\s/.test(ingestKey))) {
    throw new Error("tenant_json ingest_key must be at least 32 characters with no whitespace");
  }
  const personaEmails = Object.values(parsed.personas ?? {})
    .map((p) => p?.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));
  return {
    adminEmail: admin.email.trim().toLowerCase(),
    adminDisplayName: admin.display_name?.trim() || "Demo Admin",
    adminPassword: admin.password,
    personaEmails,
    ingestKey,
  };
}

/**
 * Resolve tenant emails JSON for demo CLIs.
 * Prefer Ops-pasted `tenant_json`, then DEMO_TENANT_JSON env, then DEMO_TENANT_FILE path.
 * Never commit passwords; Ops paste is request-scoped only.
 */
function materializeDemoTenantFile(input?: unknown): TenantFileHandle {
  const fromEnvFile = process.env.DEMO_TENANT_FILE?.trim();
  const fromEnvJson = process.env.DEMO_TENANT_JSON?.trim();

  let raw: string | undefined;
  let existingPath: string | undefined;
  if (typeof input === "string" && input.trim()) {
    raw = input.trim();
  } else if (input && typeof input === "object") {
    raw = JSON.stringify(input, null, 2);
  } else if (fromEnvJson) {
    raw = fromEnvJson;
  } else if (fromEnvFile && existsSync(fromEnvFile)) {
    raw = readFileSync(fromEnvFile, "utf8");
    existingPath = fromEnvFile;
  }

  if (!raw) {
    throw new Error(
      "Paste the tenant JSON in Ops (same shape as .demo-tenant-emails.local.json), " +
        "or set DEMO_TENANT_JSON / DEMO_TENANT_FILE on salanor-id.",
    );
  }

  const meta = parseDemoTenantRaw(raw);
  if (existingPath) {
    return { path: existingPath, cleanup: () => undefined, ...meta };
  }

  const dir = mkdtempSync(joinPath(tmpdir(), "demo-tenant-"));
  const path = joinPath(dir, "tenant.json");
  writeFileSync(path, raw, { encoding: "utf8", mode: 0o600 });
  return {
    path,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
    ...meta,
  };
}

/** Drop Ops staff from a demo org when they are not one of the pasted personas. */
async function detachNonPersonaStaff(
  client: pg.PoolClient,
  organizationId: string,
  staffEmail: string | undefined,
  personaEmails: string[],
): Promise<void> {
  const email = staffEmail?.trim().toLowerCase();
  if (!email) return;
  if (personaEmails.includes(email)) return;
  await client.query(
    `UPDATE membership m
     SET status = 'suspended'
     FROM account a
     WHERE m.account_id = a.account_id
       AND m.organization_id = $1
       AND m.status = 'active'
       AND lower(a.email) = $2`,
    [organizationId, email],
  );
}

async function executeOwnerWipe(slug: string, actor: string): Promise<Record<string, unknown>> {
  const url = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "MIGRATION_DATABASE_URL (schema owner) is required for wipe/reset on Platform Ops",
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ platform_wipe_tenant: Record<string, unknown> }>(
      `SELECT platform_wipe_tenant($1, true, $2) AS platform_wipe_tenant`,
      [slug, actor],
    );
    return result.rows[0]?.platform_wipe_tenant ?? {};
  } finally {
    await client.end();
  }
}

/** List is_demo / is_test tenants for the Demo tenants Ops page. */
platformRoutes.get("/demo-tenants", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  try {
    const tenants = await platformListDemoTenants(getPool());
    return c.json({
      tenants: tenants.map((t) => ({
        ...t,
        created_at: new Date(t.created_at).toISOString(),
        last_demo_reset_at: t.last_demo_reset_at
          ? new Date(t.last_demo_reset_at).toISOString()
          : null,
      })),
    });
  } catch (err) {
    console.error("[id] demo-tenants list", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to list demo tenants" },
      500,
    );
  }
});

platformRoutes.get("/demo-tenants/audit", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  try {
    const rows = await platformListDemoTenantAudit(getPool(), 80);
    return c.json({
      audit: rows.map((r) => ({
        ...r,
        wiped_at: new Date(r.wiped_at).toISOString(),
      })),
    });
  } catch (err) {
    console.error("[id] demo-tenants audit", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to list audit" },
      500,
    );
  }
});

/**
 * One-click: org + personas + pack + source keys + ~60d history.
 * Wipeable flag is set only so Delete/Reset can refuse customer orgs — no console "demo UX".
 */
platformRoutes.post("/demo-tenants/populate", async (c) => {
  const access = await requirePlatformPermission(c, "platform:provision");
  if (!access.ok) return c.json({ error: access.error }, 403);
  let body: {
    slug?: string;
    confirm_slug?: string;
    name?: string;
    tenant_json?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const slug = (body.slug ?? "demo-bank").trim() || "demo-bank";
  try {
    requireConfirmSlug(slug, body.confirm_slug);
  } catch (err) {
    if (err instanceof DemoTenantRefusal) {
      return c.json({ error: err.message, code: err.code }, 422);
    }
    throw err;
  }
  const name =
    (body.name ?? "").trim() ||
    (slug === "redteam-lab" ? "Red Team Lab" : slug === "demo-bank" ? "Demo Bank" : slug);

  let tenantHandle: TenantFileHandle;
  try {
    tenantHandle = materializeDemoTenantFile(body.tenant_json);
  } catch (err) {
    return c.json(
      {
        ok: false,
        action: "populate",
        slug,
        error: err instanceof Error ? err.message : "Invalid tenant_json",
      },
      400,
    );
  }

  const client = await getPool().connect();
  let organizationId: string;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{
      organization_id: string;
      is_demo: boolean;
      is_test: boolean;
    }>(
      `SELECT organization_id, COALESCE(is_demo, false) AS is_demo, COALESCE(is_test, false) AS is_test
       FROM organization WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (!row.is_demo && !row.is_test) {
        throw new DemoTenantRefusal(
          "not_wipeable",
          `Refusing populate: "${slug}" exists and is not a demo/test tenant`,
        );
      }
      // Idempotent: reuse shell org (e.g. earlier Ops create) and
      // ensure wipe flags stay set — provision CLI fills personas/pack.
      await client.query(
        `UPDATE organization
         SET is_demo = true, is_test = true, require_signed_events = true,
             plan = 'enterprise', updated_at = now()
         WHERE organization_id = $1`,
        [row.organization_id],
      );
      organizationId = row.organization_id;
      // Owner is personas.admin from the paste, not Ops staff.
      await platformEnsureOrganizationMember(client, {
        organizationId,
        email: tenantHandle.adminEmail,
        role: "admin",
        displayName: tenantHandle.adminDisplayName,
        passwordHash: hashPassword(tenantHandle.adminPassword),
      });
      await detachNonPersonaStaff(
        client,
        organizationId,
        access.staff?.email,
        tenantHandle.personaEmails,
      );
    } else {
      // Both flags true = wipeable in platform_wipe_tenant (safety rail only).
      // Seed with personas.admin — never attach the Ops superadmin.
      const provisioned = await provisionOrganization(client, {
        name,
        slug,
        plan: "enterprise",
        adminEmail: tenantHandle.adminEmail,
        adminDisplayName: tenantHandle.adminDisplayName,
        adminPasswordHash: hashPassword(tenantHandle.adminPassword),
        isDemo: true,
        isTest: true,
      });
      organizationId = provisioned.organization_id;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    tenantHandle.cleanup();
    if (err instanceof DemoTenantRefusal) {
      return c.json({ error: err.message, code: err.code }, 403);
    }
    console.error("[id] demo-tenants populate", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Populate failed" },
      500,
    );
  } finally {
    client.release();
  }

  try {
    const ingest = demoPopulateIngestKey(tenantHandle.ingestKey);
    const cliEnv = demoPopulateCliEnv(slug, name, tenantHandle.path, ingest.key);
    const stack = await runDemoCli(
      "tools/demo/provision-demo-tenant.mts",
      ["--force-pack"],
      cliEnv,
    );
    const history = await runDemoCli("tools/demo/seed-history.mts", [], cliEnv);

    await platformRecordDemoTenantAction(getPool(), {
      slug,
      action: "create",
      actor: demoActor(access),
      result: {
        organization_id: organizationId,
        provision_exit: stack.code,
        history_exit: history.code,
        ingest_key_minted: ingest.minted,
        provision_stderr_tail: stack.stderr.slice(-800),
        history_stderr_tail: history.stderr.slice(-800),
        history_stdout_tail: history.stdout.slice(-800),
      },
      requireDemoOrTest: true,
    });
    if (access.staff?.accountId) {
      await writePlatformAuditEvent(getPool(), {
        actorAccountId: access.staff.accountId,
        action: "platform.demo_tenant.populate",
        resourceType: "organization",
        resourceId: organizationId,
        metadata: { slug },
      });
    }
    const ok = stack.code === 0 && history.code === 0;
    return c.json({
      ok,
      action: "populate",
      organization_id: organizationId,
      slug,
      provision_exit: stack.code,
      history_exit: history.code,
      ingest_key_minted: ingest.minted,
      ...(ingest.minted
        ? {
            hint:
              "Minted a one-off ingest key for this run. Add ingest_key to the tenant JSON (or DEMO_BANK_INGEST_KEY on salanor-id / bank-sim) for a stable key across refreshes.",
          }
        : {}),
      ...(ok
        ? {}
        : {
            warning: "Populate finished with non-zero exit(s)",
            detail:
              history.stderr.slice(-1200) ||
              stack.stderr.slice(-1200) ||
              history.stdout.slice(-800),
          }),
    });
  } catch (err) {
    if (err instanceof DemoTenantRefusal) {
      return c.json({ error: err.message, code: err.code }, 403);
    }
    console.error("[id] demo-tenants populate", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Populate failed" },
      500,
    );
  } finally {
    tenantHandle.cleanup();
  }
});

platformRoutes.post("/demo-tenants/load-history", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  let body: { slug?: string; confirm_slug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const slug = (body.slug ?? "").trim();
  try {
    requireConfirmSlug(slug, body.confirm_slug);
    await platformAssertDemoOrTest(getPool(), slug);
  } catch (err) {
    if (err instanceof DemoTenantRefusal) {
      if (err.code === "not_wipeable") {
        await auditDemoTenantRefusal(access, slug, "load_history");
      }
      return c.json(
        { error: err.message, code: err.code },
        err.code === "confirm_mismatch" ? 422 : 403,
      );
    }
    throw err;
  }
  const run = await runDemoCli("tools/demo/seed-history.mts", [], {
    DEMO_ORG_SLUG: slug,
    DEMO_TENANT_SLUG: slug,
  });
  await platformRecordDemoTenantAction(getPool(), {
    slug,
    action: "load_history",
    actor: demoActor(access),
    result: {
      exit_code: run.code,
      stdout_tail: run.stdout.slice(-2000),
      stderr_tail: run.stderr.slice(-2000),
    },
  });
  if (run.code !== 0) {
    return c.json(
      {
        error: "Load history failed",
        code: "seed_failed",
        detail: run.stderr.slice(-1500) || run.stdout.slice(-1500),
      },
      500,
    );
  }
  return c.json({ ok: true, slug, action: "load_history" });
});

platformRoutes.post("/demo-tenants/wipe", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  let body: { slug?: string; confirm_slug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const slug = (body.slug ?? "").trim();
  try {
    requireConfirmSlug(slug, body.confirm_slug);
    await platformAssertDemoOrTest(getPool(), slug);
  } catch (err) {
    if (err instanceof DemoTenantRefusal) {
      if (err.code === "not_wipeable") {
        await auditDemoTenantRefusal(access, slug, "wipe");
      }
      return c.json(
        { error: err.message, code: err.code },
        err.code === "confirm_mismatch" ? 422 : 403,
      );
    }
    throw err;
  }
  if (process.env.AEGIS_ALLOW_TENANT_WIPE?.trim() !== "1") {
    return c.json(
      {
        error:
          "Set AEGIS_ALLOW_TENANT_WIPE=1 on Railway salanor-id (then redeploy) to allow Delete/Reset from Ops. Populate does not need it.",
        code: "env_not_set",
      },
      403,
    );
  }
  const actor = demoActor(access);
  try {
    const wipe = await executeOwnerWipe(slug, actor);
    return c.json({ ok: true, action: "wipe", wipe });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/tenant_wipe_refused|neither is_demo nor is_test/i.test(msg)) {
      await auditDemoTenantRefusal(access, slug, "wipe");
      return c.json({ error: msg, code: "not_wipeable" }, 403);
    }
    console.error("[id] demo-tenants wipe", err);
    return c.json({ error: msg }, 500);
  }
});

platformRoutes.post("/demo-tenants/reset", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  let body: { slug?: string; confirm_slug?: string; tenant_json?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const slug = (body.slug ?? "").trim();
  try {
    requireConfirmSlug(slug, body.confirm_slug);
    await platformAssertDemoOrTest(getPool(), slug);
  } catch (err) {
    if (err instanceof DemoTenantRefusal) {
      if (err.code === "not_wipeable") {
        await auditDemoTenantRefusal(access, slug, "reset");
      }
      return c.json(
        { error: err.message, code: err.code },
        err.code === "confirm_mismatch" ? 422 : 403,
      );
    }
    throw err;
  }
  if (process.env.AEGIS_ALLOW_TENANT_WIPE?.trim() !== "1") {
    return c.json(
      {
        error:
          "Set AEGIS_ALLOW_TENANT_WIPE=1 on Railway salanor-id (then redeploy) to allow Delete/Reset from Ops. Populate does not need it.",
        code: "env_not_set",
      },
      403,
    );
  }
  let tenantHandle: TenantFileHandle;
  try {
    tenantHandle = materializeDemoTenantFile(body.tenant_json);
  } catch (err) {
    return c.json(
      {
        ok: false,
        action: "reset",
        slug,
        error: err instanceof Error ? err.message : "Invalid tenant_json",
      },
      400,
    );
  }
  const actor = demoActor(access);
  try {
    const wipe = await executeOwnerWipe(slug, actor);
    // Back to the same populated demo state as Populate.
    const name = slug === "redteam-lab" ? "Red Team Lab" : slug === "demo-bank" ? "Demo Bank" : slug;
    const client = await getPool().connect();
    let organizationId: string;
    try {
      await client.query("BEGIN");
      const provisioned = await provisionOrganization(client, {
        name,
        slug,
        plan: "enterprise",
        adminEmail: tenantHandle.adminEmail,
        adminDisplayName: tenantHandle.adminDisplayName,
        adminPasswordHash: hashPassword(tenantHandle.adminPassword),
        isDemo: true,
        isTest: true,
      });
      organizationId = provisioned.organization_id;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    const ingest = demoPopulateIngestKey(tenantHandle.ingestKey);
    const cliEnv = demoPopulateCliEnv(slug, name, tenantHandle.path, ingest.key);
    const stack = await runDemoCli(
      "tools/demo/provision-demo-tenant.mts",
      ["--force-pack"],
      cliEnv,
    );
    const history = await runDemoCli("tools/demo/seed-history.mts", [], cliEnv);

    const ok = stack.code === 0 && history.code === 0;
    await platformRecordDemoTenantAction(getPool(), {
      slug,
      action: "reset",
      actor,
      result: {
        wipe,
        organization_id: organizationId,
        provision_exit: stack.code,
        history_exit: history.code,
        ingest_key_minted: ingest.minted,
        history_stderr_tail: history.stderr.slice(-800),
        history_stdout_tail: history.stdout.slice(-800),
      },
      requireDemoOrTest: true,
    });
    return c.json({
      ok,
      action: "reset",
      organization_id: organizationId,
      slug,
      wipe,
      provision_exit: stack.code,
      history_exit: history.code,
      ingest_key_minted: ingest.minted,
      ...(ok
        ? {}
        : {
            warning: "Reset finished with non-zero exit(s)",
            detail:
              history.stderr.slice(-1200) ||
              stack.stderr.slice(-1200) ||
              history.stdout.slice(-800),
          }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/tenant_wipe_refused|neither is_demo nor is_test/i.test(msg)) {
      await auditDemoTenantRefusal(access, slug, "reset");
      return c.json({ error: msg, code: "not_wipeable" }, 403);
    }
    console.error("[id] demo-tenants reset", err);
    return c.json({ error: msg }, 500);
  } finally {
    tenantHandle.cleanup();
  }
});

platformRoutes.get("/organizations/:organizationId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  const org = await platformGetOrganization(getPool(), organizationId);
  if (!org) return c.json({ error: "Not found" }, 404);
  return c.json({
    organization: {
      ...org,
      created_at: org.created_at.toISOString(),
      updated_at: org.updated_at.toISOString(),
      current_period_start: org.current_period_start?.toISOString() ?? null,
      current_period_end: org.current_period_end?.toISOString() ?? null,
    },
  });
});

platformRoutes.patch("/organizations/:organizationId", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  let body: {
    plan?: string;
    active?: boolean;
    plan_overrides?: Record<string, unknown> | null;
    is_demo?: boolean;
    is_test?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  // is_test makes a tenant wipeable: only the bootstrap-secret holder may change it.
  if (body.is_test !== undefined && !access.bootstrap) {
    return c.json({ error: "Forbidden" }, 403);
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
  // The internal platform organisation is never a demo/test (wipeable) tenant.
  if (body.is_demo === true || body.is_test === true) {
    const slugRow = await getPool().query<{ slug: string }>(
      `SELECT slug FROM organization WHERE organization_id = $1`,
      [organizationId],
    );
    if (slugRow.rows[0]?.slug === "salanor-platform") {
      return c.json(
        { error: "The platform organisation cannot be a demo or test organisation" },
        422,
      );
    }
  }
  const ok = await platformUpdateOrganization(getPool(), organizationId, {
    plan: body.plan,
    active: body.active,
    plan_overrides: body.plan_overrides,
    is_demo: typeof body.is_demo === "boolean" ? body.is_demo : undefined,
    is_test: typeof body.is_test === "boolean" ? body.is_test : undefined,
  });
  if (!ok) return c.json({ error: "Not found" }, 404);
  if (
    access.staff &&
    (body.plan !== undefined ||
      body.active !== undefined ||
      typeof body.is_demo === "boolean" ||
      typeof body.is_test === "boolean")
  ) {
    await writePlatformAuditEvent(getPool(), {
      actorAccountId: access.staff.accountId,
      action: "organization.patch",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: {
        plan: body.plan,
        active: body.active,
        is_demo: typeof body.is_demo === "boolean" ? body.is_demo : undefined,
        is_test: typeof body.is_test === "boolean" ? body.is_test : undefined,
      },
    });
  }
  return c.json({ ok: true });
});

/**
 * Platform transactional email (Resend and/or SMTP). GET never returns secrets.
 * PUT accepts write-only Resend key / SMTP password. DELETE clears the Resend key
 * (env fallback still applies for platform mode). Writes need platform:email.write.
 */
platformRoutes.get("/email-settings", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  try {
    return c.json({ settings: await getPlatformEmailSettings(getPool()) });
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") {
      return c.json(
        { error: "Email settings table is missing. Run pnpm db:migrate (reset empty DB if baseline changed)." },
        503,
      );
    }
    // Older DBs missing SMTP columns — surface a clear migrate hint.
    if ((err as { code?: string }).code === "42703") {
      return c.json(
        {
          error:
            "Email settings schema is outdated. Reset an empty database and run pnpm db:migrate (or ALTER platform_email_settings to match 001_baseline).",
        },
        503,
      );
    }
    console.error("[id] email settings read", err);
    return c.json({ error: "Failed to load email settings" }, 500);
  }
});

platformRoutes.put("/email-settings", async (c) => {
  const access = await requirePlatformPermission(c, "platform:email.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const delivery =
    body.delivery === "smtp" || body.delivery === "platform"
      ? body.delivery
      : undefined;
  try {
    const settings = await savePlatformEmailSettings(getPool(), {
      delivery,
      fromName:
        body.from_name === null
          ? null
          : typeof body.from_name === "string"
            ? body.from_name
            : undefined,
      fromAddress:
        typeof body.from_address === "string" ? body.from_address : undefined,
      replyTo:
        body.reply_to === null
          ? null
          : typeof body.reply_to === "string"
            ? body.reply_to
            : undefined,
      resendApiKey:
        typeof body.resend_api_key === "string" ? body.resend_api_key : undefined,
      clearKey: body.clear_key === true,
      smtpHost:
        body.smtp_host === null
          ? null
          : typeof body.smtp_host === "string"
            ? body.smtp_host
            : undefined,
      smtpPort:
        typeof body.smtp_port === "number" ? body.smtp_port : undefined,
      smtpSecure:
        typeof body.smtp_secure === "boolean" ? body.smtp_secure : undefined,
      smtpUser:
        body.smtp_user === null
          ? null
          : typeof body.smtp_user === "string"
            ? body.smtp_user
            : undefined,
      smtpPassword:
        body.smtp_password === null
          ? null
          : typeof body.smtp_password === "string"
            ? body.smtp_password
            : undefined,
      clearSmtpPassword: body.clear_smtp_password === true,
      updatedBy: access.staff?.email ?? "platform-bootstrap",
    });
    if (access.staff) {
      await writePlatformAuditEvent(getPool(), {
        actorAccountId: access.staff.accountId,
        action: "platform.email_settings.update",
        resourceType: "platform_email_settings",
        resourceId: "1",
        metadata: {
          delivery: settings.delivery,
          from_address_changed: body.from_address !== undefined,
          key_replaced:
            typeof body.resend_api_key === "string" &&
            body.resend_api_key.trim() !== "",
          key_cleared: body.clear_key === true,
          smtp_password_replaced:
            typeof body.smtp_password === "string" &&
            body.smtp_password !== "",
          smtp_password_cleared:
            body.clear_smtp_password === true || body.smtp_password === null,
        },
      });
    }
    return c.json({ ok: true, settings });
  } catch (err) {
    if (err instanceof PlatformEmailSettingsError) {
      return c.json({ error: err.message, code: err.code }, err.code === "master_key_missing" ? 503 : 422);
    }
    if ((err as { code?: string }).code === "42P01" || (err as { code?: string }).code === "42703") {
      return c.json(
        {
          error:
            "Email settings schema is missing or outdated. Reset an empty database and run pnpm db:migrate.",
        },
        503,
      );
    }
    console.error("[id] email settings save failed");
    return c.json({ error: "Failed to save email settings" }, 500);
  }
});

platformRoutes.delete("/email-settings", async (c) => {
  const access = await requirePlatformPermission(c, "platform:email.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  try {
    const settings = await savePlatformEmailSettings(getPool(), {
      clearKey: true,
      clearSmtpPassword: true,
      updatedBy: access.staff?.email ?? "platform-bootstrap",
    });
    if (access.staff) {
      await writePlatformAuditEvent(getPool(), {
        actorAccountId: access.staff.accountId,
        action: "platform.email_settings.update",
        resourceType: "platform_email_settings",
        resourceId: "1",
        metadata: { key_cleared: true, smtp_password_cleared: true },
      });
    }
    return c.json({ ok: true, settings });
  } catch (err) {
    console.error("[id] email settings clear failed", err instanceof Error ? err.name : "error");
    return c.json({ error: "Failed to clear email secrets" }, 500);
  }
});

/** Send a test message using currently saved platform email settings (SMTP or Resend). */
platformRoutes.post("/email-settings/test", async (c) => {
  const access = await requirePlatformPermission(c, "platform:email.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  if (!access.staff?.email) {
    return c.json({ error: "Sign in as platform staff to send a test email." }, 401);
  }

  const to = access.staff.email.trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(to) || to.length > 254) {
    return c.json({ error: "Your account email is not a valid destination for a test." }, 422);
  }

  try {
    const delivery = await resolvePlatformEmailDelivery(getPool());
    if (delivery.mode === "none" || (delivery.mode === "resend" && !delivery.apiKey)) {
      return c.json(
        {
          error:
            "Transactional email is not configured (set SMTP or a Resend key, or RESEND_API_KEY).",
        },
        422,
      );
    }
    await sendTransactionalEmail({
      to,
      subject: "Salanor platform email test",
      text:
        "This is a test message from Platform Ops Email. Your transactional email settings are working.",
      html: `<p>This is a test message from <strong>Platform Ops Email</strong>.</p><p>Your transactional email settings are working.</p>`,
    });
    if (access.staff) {
      await writePlatformAuditEvent(getPool(), {
        actorAccountId: access.staff.accountId,
        action: "platform.email_settings.test",
        resourceType: "platform_email_settings",
        resourceId: "1",
        metadata: {
          to_domain: to.split("@")[1] ?? null,
          delivery_mode: delivery.mode,
          from: delivery.from,
        },
      });
    }
    return c.json({
      ok: true,
      to,
      from: delivery.from,
      delivery_mode: delivery.mode,
    });
  } catch (err) {
    if (err instanceof EmailDeliveryError) {
      return c.json({ error: err.message, code: err.code }, 422);
    }
    console.error("[id] email settings test failed", err instanceof Error ? err.name : "error");
    return c.json({ error: "Failed to send test email" }, 500);
  }
});

/**
 * Stable ingest key for a DEMO/TEST tenant (pnpm pilot:provision-demo-tenant with
 * DEMO_BANK_INGEST_KEY). Bootstrap secret only. The operator-held secret is hashed and stored
 * like any ingest key; the same secret again is a no-op, so the key survives `pnpm demo:fresh`.
 * Refused for customer tenants (neither is_demo nor is_test).
 */
platformRoutes.put("/organizations/:organizationId/stable-ingest-key", async (c) => {
  if (!platformSecretOk(c)) return c.json({ error: "Forbidden" }, 403);
  let body: { name?: string; secret?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  try {
    const result = await platformSetStableIngestKey(getPool(), c.req.param("organizationId"), {
      name: body.name ?? "",
      secret: body.secret ?? "",
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof DemoIngestKeyError) {
      const status = err.code === "not_found" ? 404 : err.code === "not_demo_or_test" ? 403 : 422;
      return c.json({ error: err.message, code: err.code }, status);
    }
    console.error("[id] stable ingest key", err);
    return c.json({ error: "Failed to set ingest key" }, 500);
  }
});

platformRoutes.get("/organizations/:organizationId/billing/events", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  const limit = Number(c.req.query("limit") || "50");
  const events = await listOrganizationBillingEvents(getPool(), organizationId, limit);
  return c.json({
    events: events.map((e) => ({
      ...e,
      period_start: e.period_start?.toISOString() ?? null,
      period_end: e.period_end?.toISOString() ?? null,
      created_at: e.created_at.toISOString(),
    })),
  });
});

platformRoutes.post("/organizations/:organizationId/billing/pending", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  let body: {
    plan_slug?: string;
    external_invoice_ref?: string;
    amount_cents?: number;
    currency?: string;
    note?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.external_invoice_ref?.trim()) {
    return c.json(
      { error: "Invoice number is required when recording a pending invoice" },
      422,
    );
  }
  const result = await recordOrganizationBillingPending(getPool(), {
    organizationId,
    planSlug: body.plan_slug ?? null,
    externalInvoiceRef: body.external_invoice_ref,
    amountCents:
      typeof body.amount_cents === "number" && Number.isFinite(body.amount_cents)
        ? Math.round(body.amount_cents)
        : null,
    currency: body.currency ?? null,
    note: body.note ?? null,
    actorAccountId: access.staff?.accountId ?? null,
  });
  if (!result.ok) {
    const status = result.error === "Not found" ? 404 : 422;
    return c.json({ error: result.error }, status);
  }
  if (access.staff) {
    await writePlatformAuditEvent(getPool(), {
      actorAccountId: access.staff.accountId,
      action: "organization.billing.pending",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: {
        plan_slug: body.plan_slug,
        external_invoice_ref: body.external_invoice_ref,
      },
    });
  }
  return c.json({ ok: true, billing_status: "pending" });
});

platformRoutes.post("/organizations/:organizationId/billing/mark-paid", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  let body: {
    plan_slug?: string;
    period_start?: string;
    period_end?: string;
    external_invoice_ref?: string;
    amount_cents?: number;
    currency?: string;
    note?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.plan_slug?.trim() || !body.period_start || !body.period_end) {
    return c.json(
      { error: "plan_slug, period_start, and period_end are required" },
      422,
    );
  }
  const periodStart = new Date(body.period_start);
  const periodEnd = new Date(body.period_end);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return c.json({ error: "Invalid period dates" }, 422);
  }
  const result = await markOrganizationBillingPaid(getPool(), {
    organizationId,
    planSlug: body.plan_slug,
    periodStart,
    periodEnd,
    externalInvoiceRef: body.external_invoice_ref ?? null,
    amountCents:
      typeof body.amount_cents === "number" && Number.isFinite(body.amount_cents)
        ? Math.round(body.amount_cents)
        : null,
    currency: body.currency ?? "USD",
    note: body.note ?? null,
    actorAccountId: access.staff?.accountId ?? null,
  });
  if (!result.ok) {
    const status = result.error === "Not found" ? 404 : 422;
    return c.json({ error: result.error }, status);
  }
  if (access.staff) {
    await writePlatformAuditEvent(getPool(), {
      actorAccountId: access.staff.accountId,
      action: "organization.billing.mark_paid",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: {
        plan_slug: body.plan_slug,
        period_start: body.period_start,
        period_end: body.period_end,
        external_invoice_ref: body.external_invoice_ref,
      },
    });
  }
  return c.json({ ok: true, billing_status: "active", plan: body.plan_slug.trim().toLowerCase() });
});

platformRoutes.post("/organizations/:organizationId/billing/end", async (c) => {
  const access = await requirePlatformPermission(c, "platform:orgs.write");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const organizationId = c.req.param("organizationId");
  let body: { status?: "canceled" | "past_due"; note?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    /* empty body ok */
  }
  const ok = await endOrganizationBilling(getPool(), {
    organizationId,
    status: body.status === "past_due" ? "past_due" : "canceled",
    note: body.note ?? null,
    actorAccountId: access.staff?.accountId ?? null,
  });
  if (!ok) return c.json({ error: "Not found" }, 404);
  if (access.staff) {
    await writePlatformAuditEvent(getPool(), {
      actorAccountId: access.staff.accountId,
      action: "organization.billing.end",
      resourceType: "organization",
      resourceId: organizationId,
      metadata: { status: body.status ?? "canceled" },
    });
  }
  return c.json({
    ok: true,
    plan: "free",
    billing_status: body.status === "past_due" ? "past_due" : "canceled",
  });
});

platformRoutes.get("/overview/stats", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const stats = await platformOverviewStats(getPool());
  return c.json({ stats });
});

platformRoutes.get("/audit-logs/actions", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const actions = await platformListDistinctAuditActions(getPool());
  return c.json({ actions });
});

platformRoutes.get("/audit-logs", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const limit = Number(c.req.query("limit") || "50");
  const offset = Number(c.req.query("offset") || "0");
  const action = c.req.query("action")?.trim();
  const q = c.req.query("q")?.trim();
  const result = await platformListAuditLogs(getPool(), { limit, offset, action, q });
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

platformRoutes.get("/worker-runs", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const limit = Number(c.req.query("limit") || "50");
  const offset = Number(c.req.query("offset") || "0");
  const worker = c.req.query("worker");
  const workerName =
    worker === "witness" || worker === "compliance" || worker === "housekeeping"
      ? worker
      : undefined;
  const result = await platformListWorkerRuns(getPool(), {
    workerName,
    limit,
    offset,
  });
  return c.json({
    runs: result.runs.map((row) => ({
      ...row,
      started_at: row.started_at.toISOString(),
      finished_at: row.finished_at?.toISOString() ?? null,
    })),
    total: result.total,
    limit,
    offset,
  });
});

platformRoutes.get("/accounts", async (c) => {
  const access = await requirePlatformPermission(c, "platform:read");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const q = c.req.query("q");
  const staffOnly =
    c.req.query("staff") === "1" ||
    c.req.query("staff") === "true" ||
    c.req.query("platform_staff") === "1";
  const limit = Number(c.req.query("limit") || "25");
  const offset = Number(c.req.query("offset") || "0");
  const result = await platformListAccountsPaginated(getPool(), {
    query: q,
    limit,
    offset,
    staffOnly,
  });
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

/**
 * Idempotent member ensure for demo/pilot provisioning (bootstrap secret / platform:provision).
 * After a tenant wipe, accounts remain; this re-attaches membership with the requested role.
 */
platformRoutes.put("/organizations/:orgId/members", async (c) => {
  const access = await requirePlatformPermission(c, "platform:provision");
  if (!access.ok) return c.json({ error: access.error }, 403);
  const orgId = c.req.param("orgId");
  let body: {
    email?: string;
    role?: string;
    display_name?: string;
    password?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim();
  const role = (body.role ?? "approver") as OrgRole;
  const allowed: OrgRole[] = [
    "owner",
    "admin",
    "approver",
    "engineer",
    "developer",
    "auditor",
    "viewer",
  ];
  if (!email) return c.json({ error: "email required" }, 422);
  if (!allowed.includes(role)) return c.json({ error: "invalid role" }, 422);
  if (body.password !== undefined && body.password.length < 10) {
    return c.json({ error: "password must be at least 10 characters" }, 422);
  }

  const org = await getPool().query(`SELECT 1 FROM organization WHERE organization_id = $1`, [
    orgId,
  ]);
  if (!org.rows[0]) return c.json({ error: "Organization not found" }, 404);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await platformEnsureOrganizationMember(client, {
      organizationId: orgId,
      email,
      role,
      displayName: body.display_name?.trim() || null,
      passwordHash: body.password ? hashPassword(body.password) : null,
    });
    await client.query("COMMIT");
    return c.json({
      membership_id: result.membership_id,
      account_id: result.account_id,
      action: result.action,
      email: email.toLowerCase(),
      role,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof InviteError) {
      const status = err.code === "account_missing" ? 404 : 409;
      return c.json({ error: err.message, code: err.code }, status);
    }
    if (err instanceof PlanLimitError) {
      return c.json({ error: err.message, code: err.code }, err.httpStatus as 402);
    }
    console.error("[id] platform ensure member", err);
    return c.json({ error: "Failed to ensure membership" }, 500);
  } finally {
    client.release();
  }
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
    list_price?: string;
    list_price_detail?: string;
    tagline?: string;
    billing_note?: string;
    marketing_highlighted?: boolean;
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
