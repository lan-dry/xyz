import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
  auditAuthLoginSuccess,
  createSession,
  getClientIp,
  provisionJitSsoMember,
  recordAccountLoginEvent,
  resolveSsoOrganizationBySlug,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";
import { sanitizeOAuthError } from "./oauth-errors.js";
import { consoleOrigin, ssoCallbackUrl, workosEnabled } from "./oauth-config.js";
import { enforceOAuthRateLimit } from "./oauth-rate-limit.js";
import { createOAuthState, verifyOAuthState } from "./oauth-state.js";

const SSO_STATE_COOKIE = "salanor_oauth_state";

const ssoCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
  maxAge: 600,
};

function parseEnvSsoMap(): Record<string, string> {
  const raw = process.env.SSO_WORKOS_ORG_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k.toLowerCase(), v]),
    );
  } catch {
    return {};
  }
}

function ssoRedirectLogin(error: string, returnTo?: string): string {
  const url = new URL("/login", consoleOrigin());
  url.searchParams.set("oauth_error", sanitizeOAuthError(error));
  if (returnTo?.startsWith("/")) {
    url.searchParams.set("return", returnTo);
  }
  return url.toString();
}

export function registerSsoRoutes(app: import("hono").Hono): void {
  app.get("/v1/id/auth/sso/start", async (c) => {
    const limited = enforceOAuthRateLimit(c);
    if (limited) return limited;

    if (!workosEnabled()) {
      return c.json(
        {
          error:
            "Enterprise SSO is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID.",
        },
        503,
      );
    }

    const orgSlug = c.req.query("org")?.trim().toLowerCase();
    if (!orgSlug) {
      return c.json({ error: "org query parameter required (organization slug)" }, 422);
    }

    const client = await getPool().connect();
    let workosOrgId: string | null = null;
    try {
      const ctx = await resolveSsoOrganizationBySlug(client, orgSlug);
      workosOrgId = ctx?.workos_organization_id ?? null;
    } finally {
      client.release();
    }
    if (!workosOrgId) {
      workosOrgId = parseEnvSsoMap()[orgSlug] ?? null;
    }
    if (!workosOrgId) {
      return c.json({ error: `SSO not enabled for organization '${orgSlug}'` }, 404);
    }

    const returnTo = c.req.query("return") ?? "/aegis/traces";
    const state = createOAuthState({ provider: "sso", returnTo, orgSlug });

    setCookie(c, SSO_STATE_COOKIE, state, ssoCookieOptions);

    const { WorkOS } = await import("@workos-inc/node");
    const workos = new WorkOS(process.env.WORKOS_API_KEY!.trim());
    const authorizationUrl = workos.sso.getAuthorizationUrl({
      organization: workosOrgId,
      clientId: process.env.WORKOS_CLIENT_ID!.trim(),
      redirectUri: ssoCallbackUrl(),
      state,
    });

    return c.redirect(authorizationUrl, 302);
  });

  app.get("/v1/id/auth/sso/callback", async (c) => {
    const limited = enforceOAuthRateLimit(c);
    if (limited) {
      return c.redirect(ssoRedirectLogin("rate_limited"), 302);
    }

    const returnFallback = "/aegis/traces";
    if (!workosEnabled()) {
      return c.redirect(ssoRedirectLogin("sso_not_configured"), 302);
    }

    const code = c.req.query("code");
    const stateParam = c.req.query("state");
    const cookieState = getCookie(c, SSO_STATE_COOKIE);

    if (!code || !stateParam || !cookieState) {
      return c.redirect(ssoRedirectLogin("missing_code", returnFallback), 302);
    }

    const verified = verifyOAuthState(stateParam, cookieState, "sso");
    if (!verified) {
      return c.redirect(ssoRedirectLogin("invalid_state", returnFallback), 302);
    }

    const orgSlug = verified.orgSlug?.trim().toLowerCase();
    if (!orgSlug) {
      return c.redirect(ssoRedirectLogin("invalid_state", verified.returnTo), 302);
    }

    try {
      const { WorkOS } = await import("@workos-inc/node");
      const workos = new WorkOS(process.env.WORKOS_API_KEY!.trim());
      const { profile } = await workos.sso.getProfileAndToken({
        code,
        clientId: process.env.WORKOS_CLIENT_ID!.trim(),
      });

      const email = profile.email?.trim().toLowerCase();
      if (!email) {
        deleteCookie(c, SSO_STATE_COOKIE, { path: "/" });
        return c.redirect(ssoRedirectLogin("no_email", verified.returnTo), 302);
      }

      const displayName =
        [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;

      const client = await getPool().connect();
      try {
        const ssoOrg = await resolveSsoOrganizationBySlug(client, orgSlug);
        if (!ssoOrg) {
          return c.redirect(ssoRedirectLogin("no_membership", verified.returnTo), 302);
        }

        let accountId: string | undefined;
        const accountRow = await client.query<{ account_id: string }>(
          `SELECT account_id FROM account WHERE lower(email) = $1 AND active = true`,
          [email],
        );
        accountId = accountRow.rows[0]?.account_id;

        if (!accountId && ssoOrg.jit_provision) {
          const jit = await provisionJitSsoMember(client, {
            organizationId: ssoOrg.organization_id,
            email,
            displayName,
          });
          accountId = jit.account_id;
        }

        if (!accountId) {
          return c.redirect(ssoRedirectLogin("no_account", verified.returnTo), 302);
        }

        const membership = await client.query<{ organization_id: string }>(
          `SELECT m.organization_id
           FROM membership m
           JOIN organization o ON o.organization_id = m.organization_id
           WHERE m.account_id = $1
             AND m.status = 'active'
             AND o.slug = $2
           LIMIT 1`,
          [accountId, orgSlug],
        );
        const organizationId = membership.rows[0]?.organization_id;
        if (!organizationId) {
          return c.redirect(ssoRedirectLogin("no_membership", verified.returnTo), 302);
        }

        await client.query(
          `UPDATE account SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
           WHERE account_id = $1`,
          [accountId],
        );

        const { token, session } = await createSession(client, accountId, organizationId);
        const ip = getClientIp(c.req.raw.headers);
        const userAgent = c.req.header("user-agent") ?? null;
        await auditAuthLoginSuccess(client, {
          organizationId: session.organizationId,
          membershipId: session.userId,
          email: session.email,
          source: "sso-workos",
          ip,
        });
        await recordAccountLoginEvent(client, {
          accountId,
          organizationId,
          method: "sso",
          success: true,
          ipAddress: ip,
          userAgent,
        });
        deleteCookie(c, SSO_STATE_COOKIE, { path: "/" });
        setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
      } finally {
        client.release();
      }

      const returnPath = verified.returnTo.startsWith("/")
        ? verified.returnTo
        : returnFallback;
      return c.redirect(new URL(returnPath, consoleOrigin()).toString(), 302);
    } catch (err) {
      console.error("[id] sso callback", err);
      deleteCookie(c, SSO_STATE_COOKIE, { path: "/" });
      return c.redirect(ssoRedirectLogin("sso_failed", verified.returnTo), 302);
    }
  });
}
