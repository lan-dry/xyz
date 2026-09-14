import { afterEach, describe, expect, it } from "vitest";

import { ensureAuthSetCookieDomain, patchAuthResponseSetCookieDomain } from "@salanor/auth/auth-cookie-headers";
import { formatAuthSignInHost, resolveSmtpServer } from "../../../../packages/auth/src/magic-link-email";
import { resolveDevAuthCookieDomain, salanorDevAuthCookies } from "../../../../packages/auth/src/auth-cookies";
import {
  areLoopbackSiblingOrigins,
  normalizeLoopbackCallbackUrl,
  resolveSalanorAuthRedirectUrl,
  shouldPreserveAuthRequestOrigin,
} from "../../../../packages/auth/src/auth-request-origin";

describe("shouldPreserveAuthRequestOrigin", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTrust = process.env.AUTH_TRUST_HOST;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalTrust === undefined) delete process.env.AUTH_TRUST_HOST;
    else process.env.AUTH_TRUST_HOST = originalTrust;
  });

  it("is true in development when AUTH_TRUST_HOST is not false", () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_TRUST_HOST = "true";
    expect(shouldPreserveAuthRequestOrigin()).toBe(true);
  });

  it("is false when AUTH_TRUST_HOST is false", () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_TRUST_HOST = "false";
    expect(shouldPreserveAuthRequestOrigin()).toBe(false);
  });
});

describe("normalizeLoopbackCallbackUrl", () => {
  it("collapses absolute sibling localhost URLs to a relative path", () => {
    expect(
      normalizeLoopbackCallbackUrl("http://app.aegis.localhost:3000/console", "localhost:3000"),
    ).toBe("/console");
  });

  it("keeps relative callback URLs", () => {
    expect(normalizeLoopbackCallbackUrl("/admin", "localhost:3000")).toBe("/admin");
  });

  it("defaults to /app/console/aegis when missing", () => {
    expect(normalizeLoopbackCallbackUrl(undefined, "localhost:3000")).toBe("/app/console/aegis");
  });
});

describe("resolveSalanorAuthRedirectUrl", () => {
  it("remaps absolute callback URLs on sibling *.localhost hosts to baseUrl origin", () => {
    expect(
      resolveSalanorAuthRedirectUrl({
        url: "http://app.aegis.localhost:3000/console",
        baseUrl: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000/console");
  });

  it("resolves relative callback URLs against baseUrl", () => {
    expect(
      resolveSalanorAuthRedirectUrl({
        url: "/console",
        baseUrl: "http://app.aegis.localhost:3000",
      }),
    ).toBe("http://app.aegis.localhost:3000/console");
  });

  it("keeps redirects on the same origin", () => {
    expect(
      resolveSalanorAuthRedirectUrl({
        url: "http://app.aegis.localhost:3000/console",
        baseUrl: "http://app.aegis.localhost:3000",
      }),
    ).toBe("http://app.aegis.localhost:3000/console");
  });
});

describe("areLoopbackSiblingOrigins", () => {
  it("treats localhost and app.aegis.localhost as siblings", () => {
    expect(
      areLoopbackSiblingOrigins(
        "http://localhost:3000",
        "http://app.aegis.localhost:3000",
      ),
    ).toBe(true);
  });
});

describe("resolveSmtpServer", () => {
  const originalEmailServer = process.env.EMAIL_SERVER;

  afterEach(() => {
    if (originalEmailServer === undefined) delete process.env.EMAIL_SERVER;
    else process.env.EMAIL_SERVER = originalEmailServer;
  });

  it("prefers EMAIL_SERVER when provider.server is the Auth.js localhost placeholder", () => {
    process.env.EMAIL_SERVER = "smtp://resend:key@smtp.resend.com:587";
    expect(
      resolveSmtpServer({
        server: { host: "localhost", port: 25, auth: { user: "", pass: "" } },
      }),
    ).toBe("smtp://resend:key@smtp.resend.com:587");
  });

  it("uses a string provider.server when set", () => {
    process.env.EMAIL_SERVER = "smtp://env@smtp.example.com:587";
    expect(resolveSmtpServer({ server: "smtp://provider@smtp.example.com:587" })).toBe(
      "smtp://provider@smtp.example.com:587",
    );
  });
});

describe("formatAuthSignInHost", () => {
  it("uses the magic link URL host when trustHost builds console links", () => {
    expect(
      formatAuthSignInHost(
        "http://app.aegis.localhost:3000/api/auth/callback/email?token=abc&email=user%40example.com",
      ),
    ).toBe("app.aegis.localhost:3000");
  });

  it("uses localhost when the link targets the apex dev host", () => {
    expect(
      formatAuthSignInHost("http://localhost:3000/api/auth/callback/email?token=abc"),
    ).toBe("localhost:3000");
  });
});

describe("resolveDevAuthCookieDomain", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieDomain = process.env.AUTH_COOKIE_DOMAIN;
  const originalAuthUrl = process.env.AUTH_URL;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalSalanorEnv = process.env.SALANOR_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCookieDomain === undefined) {
      delete process.env.AUTH_COOKIE_DOMAIN;
    } else {
      process.env.AUTH_COOKIE_DOMAIN = originalCookieDomain;
    }
    if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = originalAuthUrl;
    if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalNextAuthUrl;
    if (originalSalanorEnv === undefined) delete process.env.SALANOR_ENV;
    else process.env.SALANOR_ENV = originalSalanorEnv;
  });

  it("defaults to .localhost in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.AUTH_COOKIE_DOMAIN;
    expect(resolveDevAuthCookieDomain()).toBe(".localhost");
  });

  it("returns undefined in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.SALANOR_ENV;
    expect(resolveDevAuthCookieDomain()).toBeUndefined();
  });

  it("applies .localhost to all dev auth cookies", () => {
    process.env.NODE_ENV = "development";
    delete process.env.AUTH_COOKIE_DOMAIN;
    const cookies = salanorDevAuthCookies();
    expect(cookies?.sessionToken?.options?.domain).toBe(".localhost");
    expect(cookies?.csrfToken?.options?.path).toBe("/");
    expect(cookies?.webAuthnChallenge?.options?.domain).toBe(".localhost");
  });
});

describe("patchAuthResponseSetCookieDomain", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("adds Domain=.localhost to Set-Cookie when missing", async () => {
    process.env.NODE_ENV = "development";
    const response = new Response(null, {
      headers: {
        "set-cookie": "authjs.session-token=abc; Path=/; HttpOnly; SameSite=Lax",
      },
    });
    const patched = patchAuthResponseSetCookieDomain(response);
    expect(patched.headers.get("set-cookie")).toContain("Domain=.localhost");
  });

  it("replaces an existing Domain with .localhost in dev", async () => {
    process.env.NODE_ENV = "development";
    const raw = "authjs.session-token=abc; Path=/; Domain=localhost; HttpOnly";
    expect(ensureAuthSetCookieDomain(raw, ".localhost")).toContain("Domain=.localhost");
    expect(ensureAuthSetCookieDomain(raw, ".localhost")).not.toContain("Domain=localhost");
  });

  it("strips Secure on http local dev cookies", async () => {
    process.env.NODE_ENV = "development";
    const raw = "authjs.session-token=abc; Path=/; Secure; HttpOnly";
    const patched = ensureAuthSetCookieDomain(raw, ".localhost");
    expect(patched).not.toMatch(/;\s*Secure\b/i);
    expect(patched).toContain("SameSite=Lax");
  });
});
