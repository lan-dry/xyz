import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSOLE_AEGIS_BASE } from "@/lib/app-paths";
import { resetPublicSiteCache } from "@/lib/public-hosts";

type MiddlewareHandlerCtx = {
  params?: Record<string, string | string[]>;
};

const middlewareCtx: MiddlewareHandlerCtx = {};

vi.mock("@salanor/auth/auth-config", () => ({
  salanorAuthConfig: {},
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: (req: NextRequest, ctx: MiddlewareHandlerCtx) => Promise<Response | void>) =>
      handler,
  }),
}));

vi.mock("@/lib/totp/challenge-cookie", () => ({
  TOTP_CHALLENGE_COOKIE_NAME: "salanor_totp",
  validateTotpChallengeCookie: vi.fn().mockResolvedValue(true),
}));

function createReq(pathname: string, auth: unknown, host = "localhost:3000"): NextRequest {
  const url = new URL(`http://${host}${pathname}`);
  return {
    auth,
    headers: new Headers({ host }),
    nextUrl: new URL(`http://${host}${pathname}`),
    url: url.href,
  } as NextRequest;
}

describe("middleware admin gate", () => {
  it("redirects unauthenticated /admin requests", async () => {
    const middleware = (await import("./middleware")).default;
    const res = await middleware(createReq("/admin/contacts", null), middlewareCtx);
    expect(res).toBeInstanceOf(Response);
    expect(res?.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?callbackUrl=%2Fadmin%2Fcontacts",
    );
  });

  it("allows authenticated /admin requests", async () => {
    const middleware = (await import("./middleware")).default;
    const res = await middleware(
      createReq("/admin", {
        user: { id: "u1", totpEnabled: false, totpVerified: false },
      }),
      middlewareCtx,
    );
    expect(res).toBeUndefined();
  });
});

describe("middleware host routing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.resetModules();
  });

  it("rewrites dev console path before auth", async () => {
    const middleware = (await import("./middleware")).default;
    const res = await middleware(createReq(CONSOLE_AEGIS_BASE, null), middlewareCtx);
    expect(res?.headers.get("x-middleware-rewrite")).toContain("/console");
  });

  it("redirects foo.localhost in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const middleware = (await import("./middleware")).default;
    const res = await middleware(createReq("/", null, "foo.localhost:3000"), middlewareCtx);
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toMatch(/localhost:3000/);
  });

  it("redirects salanor.com /console to app host in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    resetPublicSiteCache();
    const middleware = (await import("./middleware")).default;
    const res = await middleware(createReq("/console", null, "salanor.com"), middlewareCtx);
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://app.salanor.com/console/aegis");
  });
});
