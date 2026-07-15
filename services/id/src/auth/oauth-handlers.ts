import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
  auditAuthLoginSuccess,
  createSession,
  getClientIp,
  OAuthLoginError,
  recordAccountLoginEvent,
  resolveOrCreateOAuthLogin,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
  type OAuthProvider,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";
import { buildMePayload } from "../routes/identity.js";
import { verifyGoogleIdToken } from "./google-id-token.js";
import { sanitizeOAuthError } from "./oauth-errors.js";
import {
  consoleOrigin,
  oauthCallbackUrl,
  oauthEnabled,
  type SocialOAuthProvider,
} from "./oauth-config.js";
import { generatePkcePair } from "./oauth-pkce.js";
import { enforceOAuthRateLimit } from "./oauth-rate-limit.js";
import { createOAuthState, verifyOAuthState } from "./oauth-state.js";

const OAUTH_STATE_COOKIE = "salanor_oauth_state";
const OAUTH_PKCE_COOKIE = "salanor_oauth_pkce";

const oauthCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
  maxAge: 600,
};

type TokenResponse = {
  access_token: string;
  id_token?: string;
  token_type?: string;
  error?: string;
};

function clearOAuthCookies(c: Context): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
  deleteCookie(c, OAUTH_PKCE_COOKIE, { path: "/" });
}

async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
): Promise<{ subject: string; email: string; name: string | null }> {
  const clientId = process.env.AUTH_GOOGLE_ID!.trim();
  const clientSecret = process.env.AUTH_GOOGLE_SECRET!.trim();
  const redirectUri = oauthCallbackUrl("google");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error("google_token_exchange_failed");
  }
  const token = (await tokenRes.json()) as TokenResponse;

  if (token.id_token) {
    const claims = await verifyGoogleIdToken(token.id_token, clientId);
    return {
      subject: claims.sub,
      email: claims.email,
      name: claims.name,
    };
  }

  // Fallback if id_token omitted (non-standard); prefer JWKS path above.
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error("google_userinfo_failed");
  }
  const profile = (await profileRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.sub || !profile.email) {
    throw new Error("google_profile_incomplete");
  }
  if (profile.email_verified === false) {
    throw new Error("google_email_unverified");
  }
  return { subject: profile.sub, email: profile.email, name: profile.name ?? null };
}

async function exchangeGithubCode(
  code: string,
  codeVerifier: string,
): Promise<{ subject: string; email: string; name: string | null }> {
  const clientId = process.env.AUTH_GITHUB_ID!.trim();
  const clientSecret = process.env.AUTH_GITHUB_SECRET!.trim();
  const redirectUri = oauthCallbackUrl("github");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error("github_token_exchange_failed");
  }
  const token = (await tokenRes.json()) as TokenResponse;
  if (token.error || !token.access_token) {
    throw new Error("github_token_missing");
  }

  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Salanor-ID",
    },
  });
  if (!profileRes.ok) {
    throw new Error("github_profile_failed");
  }
  const profile = (await profileRes.json()) as {
    id: number;
    email?: string | null;
    name?: string | null;
    login?: string;
  };

  let email = profile.email?.trim() ?? "";
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Salanor-ID",
      },
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      const primary =
        emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = primary?.email ?? "";
    }
  }
  if (!email) {
    throw new Error("github_email_unavailable");
  }

  return {
    subject: String(profile.id),
    email,
    name: profile.name ?? profile.login ?? null,
  };
}

function selfServeSignupEnabled(): boolean {
  const v = process.env.SELF_SERVE_SIGNUP_ENABLED?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

function redirectLogin(
  c: Context,
  error: string,
  returnTo: string,
  opts?: { oauthEmail?: string },
): Response {
  clearOAuthCookies(c);
  const safeError = sanitizeOAuthError(error);
  const base = consoleOrigin();
  const oauthEmail = opts?.oauthEmail?.trim();
  const useSignup =
    safeError === "no_account" && selfServeSignupEnabled() && Boolean(oauthEmail?.includes("@"));
  const url = new URL(useSignup ? "/signup" : "/login", base);
  if (!useSignup) {
    url.searchParams.set("oauth_error", safeError);
  } else if (oauthEmail) {
    url.searchParams.set("email", oauthEmail);
    url.searchParams.set("from", "oauth");
  }
  if (returnTo.startsWith("/")) {
    url.searchParams.set("return", returnTo);
  }
  return c.redirect(url.toString(), 302);
}

export function registerOAuthRoutes(app: import("hono").Hono): void {
  app.get("/v1/id/auth/oauth/providers", (c) => {
    const social = oauthEnabled();
    return c.json({
      google: social.google,
      github: social.github,
      sso: Boolean(process.env.WORKOS_API_KEY?.trim() && process.env.WORKOS_CLIENT_ID?.trim()),
    });
  });

  for (const provider of ["google", "github"] as const) {
    app.get(`/v1/id/auth/oauth/${provider}/start`, (c) => {
      const limited = enforceOAuthRateLimit(c);
      if (limited) return limited;

      const enabled = oauthEnabled();
      if (!enabled[provider]) {
        return c.json({ error: `${provider} OAuth is not configured` }, 503);
      }

      const returnTo = c.req.query("return") ?? "/aegis/traces";
      const { verifier, challenge } = generatePkcePair();
      const state = createOAuthState({ provider, returnTo });

      setCookie(c, OAUTH_STATE_COOKIE, state, oauthCookieOptions);
      setCookie(c, OAUTH_PKCE_COOKIE, verifier, oauthCookieOptions);

      const redirectUri = oauthCallbackUrl(provider);
      let authorizeUrl: URL;

      if (provider === "google") {
        authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authorizeUrl.searchParams.set("client_id", process.env.AUTH_GOOGLE_ID!.trim());
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("scope", "openid email profile");
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("code_challenge", challenge);
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
        authorizeUrl.searchParams.set("access_type", "online");
        authorizeUrl.searchParams.set("prompt", "select_account");
      } else {
        authorizeUrl = new URL("https://github.com/login/oauth/authorize");
        authorizeUrl.searchParams.set("client_id", process.env.AUTH_GITHUB_ID!.trim());
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("scope", "read:user user:email");
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("code_challenge", challenge);
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
      }

      return c.redirect(authorizeUrl.toString(), 302);
    });

    app.get(`/v1/id/auth/oauth/${provider}/callback`, async (c) => {
      const limited = enforceOAuthRateLimit(c);
      if (limited) {
        return redirectLogin(c, "rate_limited", "/aegis/traces");
      }

      const returnFallback = "/aegis/traces";
      const err = c.req.query("error");
      if (err) {
        return redirectLogin(c, sanitizeOAuthError(err), returnFallback);
      }

      const code = c.req.query("code");
      const stateParam = c.req.query("state");
      const cookieState = getCookie(c, OAUTH_STATE_COOKIE);
      const codeVerifier = getCookie(c, OAUTH_PKCE_COOKIE);

      if (!code || !stateParam || !cookieState || !codeVerifier) {
        return redirectLogin(c, "missing_code", returnFallback);
      }

      const verified = verifyOAuthState(stateParam, cookieState, provider);
      if (!verified) {
        return redirectLogin(c, "invalid_state", returnFallback);
      }

      try {
        const profile =
          provider === "google"
            ? await exchangeGoogleCode(code, codeVerifier)
            : await exchangeGithubCode(code, codeVerifier);

        const client = await getPool().connect();
        try {
          const auth = await resolveOrCreateOAuthLogin(
            client,
            {
              provider: provider as OAuthProvider,
              providerSubject: profile.subject,
              email: profile.email,
              displayName: profile.name,
            },
            { allowSignup: selfServeSignupEnabled() },
          );
          if (!auth) {
            return redirectLogin(c, "no_account", verified.returnTo, {
              oauthEmail: profile.email,
            });
          }

          const { token, session } = await createSession(
            client,
            auth.accountId,
            auth.organizationId,
          );
          const ip = getClientIp(c.req.raw.headers);
          const userAgent = c.req.header("user-agent") ?? null;
          await auditAuthLoginSuccess(client, {
            organizationId: session.organizationId,
            membershipId: session.userId,
            email: session.email,
            source: `oauth-${provider}`,
            ip,
          });
          await recordAccountLoginEvent(client, {
            accountId: auth.accountId,
            organizationId: session.organizationId,
            method: provider,
            success: true,
            ipAddress: ip,
            userAgent,
          });
          clearOAuthCookies(c);
          setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
          await buildMePayload(session);

          const returnPath = verified.returnTo.startsWith("/")
            ? verified.returnTo
            : "/aegis/traces";
          const destPath = auth.needsOnboarding
            ? `/onboarding?return=${encodeURIComponent(returnPath)}`
            : returnPath;
          const dest = new URL(destPath, consoleOrigin());
          return c.redirect(dest.toString(), 302);
        } finally {
          client.release();
        }
      } catch (e) {
        if (e instanceof OAuthLoginError) {
          return redirectLogin(c, e.code, verified.returnTo);
        }
        console.error(`[id] oauth ${provider} callback`, e);
        return redirectLogin(c, "oauth_failed", verified.returnTo);
      }
    });
  }
}
