import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ACCOUNT_BOOTSTRAP_COOKIE,
  auditAuthLoginDenied,
  auditAuthLoginFailed,
  auditAuthLoginSuccess,
  createSession,
  deleteSession,
  getClientGeoFromHeaders,
  getClientIp,
  isEmailVerified,
  pickDefaultOrganizationId,
  recordAccountLoginEvent,
  resolveSession,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
  verifyAccountBootstrapToken,
  verifyAccountPassword,
} from "@salanor/platform-auth";
import {
  buildAccountBootstrapPayload,
  buildMePayload,
} from "../../../id/src/routes/identity.js";
import { getIdentityPool, identityConfigured } from "./pool.js";

function serializeUser(session: {
  userId: string;
  organizationId: string;
  email: string;
  displayName: string | null;
  role: string;
}) {
  return {
    user_id: session.userId,
    organization_id: session.organizationId,
    email: session.email,
    display_name: session.displayName,
    role: session.role,
  };
}

export function registerWorkspaceAuthRoutes(app: Hono): void {
  app.post("/id/auth/login", async (c) => {
    let body: { email?: string; password?: string; organization_id?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (!body.email || !body.password) {
      return c.json({ error: "email and password required" }, 422);
    }
    if (!identityConfigured()) {
      return c.json(
        {
          error:
            "Workspace auth database not configured (DATABASE_URL or STOA_IDENTITY_DATABASE_URL).",
        },
        503,
      );
    }

    const ip = getClientIp(c.req.raw.headers);
    const userAgent = c.req.header("user-agent") ?? null;
    const email = body.email.trim().toLowerCase();
    const client = await getIdentityPool().connect();
    try {
      const verified = await verifyAccountPassword(client, email, body.password);
      if (!verified) {
        await auditAuthLoginFailed(client, {
          email,
          reason: "invalid_credentials",
          ip,
        });
        return c.json({ error: "Invalid credentials" }, 401);
      }

      const emailVerified = await isEmailVerified(client, verified.accountId);
      if (!emailVerified) {
        await auditAuthLoginDenied(client, {
          email,
          reason: "email_unverified",
          code: "email_unverified",
          ip,
        });
        return c.json(
          {
            error: "Verify your email before signing in.",
            code: "email_unverified",
          },
          403,
        );
      }

      const organizationId = await pickDefaultOrganizationId(
        client,
        verified.accountId,
        body.organization_id,
      );
      if (!organizationId) {
        return c.json({ error: "No organization membership" }, 403);
      }

      const { token, session } = await createSession(
        client,
        verified.accountId,
        organizationId,
      );
      const geo = getClientGeoFromHeaders(c.req.raw.headers);
      await auditAuthLoginSuccess(client, {
        organizationId: session.organizationId,
        membershipId: session.userId,
        email: session.email,
        source: "stoa-api",
        ip,
        geo,
      });
      await recordAccountLoginEvent(client, {
        accountId: verified.accountId,
        method: "password",
        success: true,
        ipAddress: ip,
        userAgent,
      });

      setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 14));
      return c.json({ user: serializeUser(session) });
    } finally {
      client.release();
    }
  });

  app.post("/id/auth/logout", async (c) => {
    const token = getCookie(c, SALANOR_SESSION_COOKIE);
    if (token && identityConfigured()) {
      await deleteSession(getIdentityPool(), token);
    }
    deleteCookie(c, SALANOR_SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/id/auth/me", async (c) => {
    const token = getCookie(c, SALANOR_SESSION_COOKIE);
    if (token && identityConfigured()) {
      const session = await resolveSession(getIdentityPool(), token);
      if (session) {
        try {
          return c.json(await buildMePayload(session));
        } catch (err) {
          console.error("[stoa-api] auth/me", err);
          return c.json({ error: "Failed to load session" }, 500);
        }
      }
    }

    const bootstrap = getCookie(c, ACCOUNT_BOOTSTRAP_COOKIE);
    if (bootstrap) {
      const accountId = verifyAccountBootstrapToken(bootstrap);
      if (accountId) {
        try {
          return c.json(await buildAccountBootstrapPayload(accountId));
        } catch (err) {
          console.error("[stoa-api] auth/me bootstrap", err);
          return c.json({ error: "Failed to load account" }, 500);
        }
      }
    }

    return c.json({ error: "Please sign in." }, 401);
  });

  app.post("/id/auth/validate", async (c) => {
    let body: { token?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }
    if (!body.token) {
      return c.json({ error: "token required" }, 422);
    }
    if (!identityConfigured()) {
      return c.json({ error: "Identity database not configured" }, 503);
    }
    const session = await resolveSession(getIdentityPool(), body.token);
    if (!session) {
      return c.json({ error: "Please sign in." }, 401);
    }
    return c.json({ session });
  });
}
