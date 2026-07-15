import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  auditAuthLoginDenied,
  auditAuthLoginFailed,
  auditAuthLoginSuccess,
  auditConsoleEvent,
  authenticateDevUser,
  cleanupAbandonedPendingOrganizations,
  createPasswordResetToken,
  createSession,
  deleteSession,
  getClientIp,
  isEmailVerified,
  recordAccountLoginEvent,
  resetPasswordWithToken,
  resolveAuditContextForAccount,
  resolveSession,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
  type ConsoleSession,
} from "@salanor/platform-auth";
import { pingDatabase, getPool } from "./db/pool.js";
import { buildMePayload, identityRoutes } from "./routes/identity.js";
import { platformRoutes } from "./routes/platform.js";
import { sendEmailVerificationEmail } from "./email/send-email-verification.js";
import { registerOAuthRoutes } from "./auth/oauth-handlers.js";
import { registerSsoRoutes } from "./auth/sso-workos.js";

const consoleOrigin =
  process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";
const platformOrigin =
  process.env.PLATFORM_ORIGIN ?? "http://localhost:3003";
const marketingOrigin =
  process.env.MARKETING_ORIGIN ?? "http://localhost:3001";

export const app = new Hono();

registerOAuthRoutes(app);
registerSsoRoutes(app);

app.use(
  "*",
  cors({
    origin: [consoleOrigin, platformOrigin, marketingOrigin],
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

function serializeUser(session: ConsoleSession) {
  return {
    user_id: session.userId,
    organization_id: session.organizationId,
    email: session.email,
    display_name: session.displayName,
    role: session.role,
  };
}

app.get("/health", async (c) => {
  if (!process.env.DATABASE_URL) {
    return c.json({
      status: "ok",
      service: "salanor-id",
      stage: 12,
      database: "not_configured",
    });
  }
  const dbUp = await pingDatabase();
  return c.json(
    {
      status: dbUp ? "ok" : "degraded",
      service: "salanor-id",
      stage: 12,
      database: dbUp ? "up" : "down",
    },
    dbUp ? 200 : 503,
  );
});

app.route("/v1/id", identityRoutes);
app.route("/v1/id/platform", platformRoutes);

app.post("/v1/id/auth/login", async (c) => {
  let body: { email?: string; password?: string; organization_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.email || !body.password) {
    return c.json({ error: "email and password required" }, 422);
  }

  if (!process.env.DATABASE_URL) {
    return c.json(
      {
        error:
          "Salanor ID is not configured (DATABASE_URL missing). Run docker compose and pnpm db:migrate.",
      },
      503,
    );
  }

  const ip = getClientIp(c.req.raw.headers);
  const userAgent = c.req.header("user-agent") ?? null;
  const email = body.email.trim().toLowerCase();

  let client;
  try {
    client = await getPool().connect();
    const auth = await authenticateDevUser(client, email, body.password);
    if (!auth) {
      await auditAuthLoginFailed(client, { email, reason: "invalid_credentials", ip });
      const failedAccount = await client.query<{ account_id: string }>(
        `SELECT account_id FROM account WHERE lower(email) = $1 AND active = true`,
        [email],
      );
      if (failedAccount.rows[0]) {
        await recordAccountLoginEvent(client, {
          accountId: failedAccount.rows[0].account_id,
          method: "password",
          success: false,
          failureReason: "invalid_credentials",
          ipAddress: ip,
          userAgent,
        });
      }
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const verified = await isEmailVerified(client, auth.accountId);
    if (!verified) {
      await auditAuthLoginDenied(client, {
        email,
        reason: "email_unverified",
        code: "email_unverified",
        organizationId: auth.organizationId,
        ip,
      });
      await recordAccountLoginEvent(client, {
        accountId: auth.accountId,
        organizationId: auth.organizationId,
        method: "password",
        success: false,
        failureReason: "email_unverified",
        ipAddress: ip,
        userAgent,
      });
      return c.json(
        {
          error: "Verify your email before signing in.",
          code: "email_unverified",
        },
        403,
      );
    }

    const organizationId = body.organization_id ?? auth.organizationId;
    const { token, session } = await createSession(
      client,
      auth.accountId,
      organizationId,
    );
    await auditAuthLoginSuccess(client, {
      organizationId: session.organizationId,
      membershipId: session.userId,
      email: session.email,
      source: "salanor-id",
      ip,
    });
    await recordAccountLoginEvent(client, {
      accountId: auth.accountId,
      organizationId: session.organizationId,
      method: "password",
      success: true,
      ipAddress: ip,
      userAgent,
    });
    setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
    return c.json(await buildMePayload(session));
  } catch (err) {
    console.error("[id] login failed", err);
    const message = err instanceof Error ? err.message : "Login failed";
    const hint = message.includes("ECONNREFUSED")
      ? "Database unreachable. Start Postgres: docker compose up -d"
      : message;
    return c.json({ error: hint }, 500);
  } finally {
    client?.release();
  }
});

app.post("/v1/id/auth/forgot-password", async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim();
  if (!email) {
    return c.json({ error: "email required" }, 422);
  }

  if (!process.env.DATABASE_URL) {
    return c.json({ error: "Salanor ID is not configured" }, 503);
  }

  const { sendPasswordResetEmail } = await import("./email/send-password-reset.js");
  const client = await getPool().connect();
  try {
    const created = await createPasswordResetToken(client, email);
    if (created) {
      const resetUrl = `${consoleOrigin}/reset-password?token=${encodeURIComponent(created.token)}`;
      await sendPasswordResetEmail({ to: email, resetUrl });
    }
    return c.json({
      ok: true,
      message:
        "If an account exists for that email, a reset link has been sent (or logged in the ID terminal).",
    });
  } finally {
    client.release();
  }
});

app.post("/v1/id/auth/reset-password", async (c) => {
  let body: { token?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const token = body.token?.trim();
  const password = body.password;
  if (!token || !password) {
    return c.json({ error: "token and password required" }, 422);
  }
  if (password.length < 10) {
    return c.json({ error: "Password must be at least 10 characters" }, 422);
  }

  const client = await getPool().connect();
  try {
    const accountId = await resetPasswordWithToken(client, token, password);
    if (!accountId) {
      return c.json({ error: "Invalid or expired reset link" }, 422);
    }
    const ctx = await resolveAuditContextForAccount(client, accountId);
    if (ctx) {
      await auditConsoleEvent(
        client,
        {
          organizationId: ctx.organizationId,
          membershipId: ctx.membershipId,
        },
        {
          action: "auth.password.reset",
          resourceType: "account",
          resourceId: accountId,
        },
      );
    }
    return c.json({ ok: true });
  } finally {
    client.release();
  }
});

app.post("/v1/id/auth/logout", async (c) => {
  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  let accountId: string | null = null;
  if (token) {
    const session = await resolveSession(getPool(), token);
    accountId = session?.accountId ?? null;
    await deleteSession(getPool(), token);
  }
  deleteCookie(c, SALANOR_SESSION_COOKIE, { path: "/" });

  if (accountId && process.env.DATABASE_URL) {
    const client = await getPool().connect();
    try {
      await cleanupAbandonedPendingOrganizations(client, accountId);
    } catch (err) {
      console.error("[id] abandon onboarding cleanup", err);
    } finally {
      client.release();
    }
  }

  return c.json({ ok: true });
});

app.get("/v1/id/auth/me", async (c) => {
  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const session = await resolveSession(getPool(), token);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    return c.json(await buildMePayload(session));
  } catch (err) {
    console.error("[id] auth/me", err);
    return c.json({ error: "Failed to load session" }, 500);
  }
});

app.post("/v1/id/auth/validate", async (c) => {
  let body: { token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.token) {
    return c.json({ error: "token required" }, 422);
  }
  const session = await resolveSession(getPool(), body.token);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ session });
});

