import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import {
  resolveSession,
  resolveSessionViaId,
  SALANOR_SESSION_COOKIE,
  type ConsoleSession,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";
import { getIdentityPool, identityConfigured } from "../identity/pool.js";
import { syncUserSiteFromDirectory } from "../sites/directory-sync.js";
import { resolveGatewayCredential } from "../gateway/credentials.js";

export type StoaContext = {
  tenantId: string;
  userId: string;
  userExternalId: string;
  authMode: "session" | "dev" | "gateway";
  session?: ConsoleSession;
  gatewayCredentialId?: string;
};

declare module "hono" {
  interface ContextVariableMap {
    stoa: StoaContext;
  }
}

async function resolvePlatformSession(
  token: string,
): Promise<ConsoleSession | null> {
  if (identityConfigured()) {
    try {
      return await resolveSession(getIdentityPool(), token);
    } catch {
      /* fall through */
    }
  }
  if (process.env.STOA_USE_REMOTE_ID === "1") {
    const idUrl = process.env.SALANOR_ID_URL;
    if (idUrl) {
      try {
        return await resolveSessionViaId(idUrl, token);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function ensureTenantAndUser(
  session: ConsoleSession,
): Promise<{ tenantId: string; userId: string }> {
  const pool = getPool();
  let orgName = "Organization";
  if (identityConfigured()) {
    const org = await getIdentityPool().query<{ name: string }>(
      `SELECT name FROM organization WHERE organization_id = $1`,
      [session.organizationId],
    );
    orgName = org.rows[0]?.name ?? orgName;
  }
  let tenantRow = await pool.query<{ id: string }>(
    `SELECT id FROM stoa_tenant WHERE platform_organization_id = $1`,
    [session.organizationId],
  );
  if (!tenantRow.rows[0]) {
    const slug = `org-${session.organizationId.replace(/-/g, "").slice(0, 12)}`;
    tenantRow = await pool.query<{ id: string }>(
      `INSERT INTO stoa_tenant (slug, name, platform_organization_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (platform_organization_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [slug, orgName, session.organizationId],
    );
  } else {
    await pool.query(`UPDATE stoa_tenant SET name = $2 WHERE id = $1`, [
      tenantRow.rows[0].id,
      orgName,
    ]);
  }
  const tenantId = tenantRow.rows[0]?.id;
  if (!tenantId) {
    throw new Error("Failed to resolve Stoa tenant");
  }

  const userRow = await pool.query<{ id: string }>(
    `INSERT INTO stoa_user (tenant_id, external_id, display_name, platform_account_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, external_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           platform_account_id = EXCLUDED.platform_account_id
     RETURNING id`,
    [
      tenantId,
      session.email.toLowerCase(),
      session.displayName ?? session.email,
      session.accountId,
    ],
  );
  const userId = userRow.rows[0]?.id;
  if (!userId) {
    throw new Error("Failed to resolve Stoa user");
  }
  try {
    await syncUserSiteFromDirectory({
      tenantId,
      stoaUserId: userId,
      platformOrganizationId: session.organizationId,
      platformAccountId: session.accountId,
    });
  } catch {
    /* directory sync optional */
  }
  return { tenantId, userId };
}

async function devContext(c: Context): Promise<StoaContext | null> {
  const externalId =
    c.req.header("X-Stoa-Dev-User")?.trim() ||
    process.env.STOA_DEV_USER?.trim();
  if (!externalId) {
    return null;
  }
  const tenantSlug =
    c.req.header("X-Stoa-Dev-Tenant")?.trim() ||
    process.env.STOA_DEV_TENANT_SLUG ||
    "local";

  const pool = getPool();
  const tenantRow = await pool.query<{ id: string }>(
    `SELECT id FROM stoa_tenant WHERE slug = $1`,
    [tenantSlug],
  );
  const tenantId = tenantRow.rows[0]?.id;
  if (!tenantId) {
    return null;
  }

  const userRow = await pool.query<{ id: string }>(
    `INSERT INTO stoa_user (tenant_id, external_id, display_name)
     VALUES ($1, $2, $2)
     ON CONFLICT (tenant_id, external_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [tenantId, externalId],
  );
  const userId = userRow.rows[0]?.id;
  if (!userId) {
    return null;
  }

  return {
    tenantId,
    userId,
    userExternalId: externalId,
    authMode: "dev",
  };
}

function parseBearerToken(c: Context): string | null {
  const header = c.req.header("Authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

export async function sessionAuthMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const bearer = parseBearerToken(c);
  if (bearer?.startsWith("stg_")) {
    const resolved = await resolveGatewayCredential(bearer);
    if (resolved) {
      c.set("stoa", {
        tenantId: resolved.tenantId,
        userId: resolved.userId,
        userExternalId: "__gateway__",
        authMode: "gateway",
        gatewayCredentialId: resolved.credentialId,
      });
      await next();
      return;
    }
    return c.json({ error: "Invalid gateway credential" }, 401);
  }

  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  if (token) {
    const platformSession = await resolvePlatformSession(token);
    if (platformSession) {
      try {
        const { tenantId, userId } = await ensureTenantAndUser(platformSession);
        c.set("stoa", {
          tenantId,
          userId,
          userExternalId: platformSession.email,
          authMode: "session",
          session: platformSession,
        });
        await next();
        return;
      } catch {
        return c.json({ error: "Failed to provision Stoa tenant" }, 500);
      }
    }
  }

  const allowDev =
    process.env.STOA_ALLOW_DEV_AUTH === "1" ||
    process.env.NODE_ENV !== "production";
  if (allowDev) {
    const dev = await devContext(c);
    if (dev) {
      c.set("stoa", dev);
      await next();
      return;
    }
  }

  return c.json({ error: "Please sign in." }, 401);
}

export function requireStoaAdmin(c: Context): ConsoleSession | null {
  const ctx = c.get("stoa");
  if (ctx.authMode !== "session" || !ctx.session) {
    return null;
  }
  const role = ctx.session.role.toLowerCase();
  if (role === "admin" || role === "owner") {
    return ctx.session;
  }
  return null;
}
