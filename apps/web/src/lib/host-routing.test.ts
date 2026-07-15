import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { CONSOLE_AEGIS_BASE } from "@/lib/app-paths";
import { handleHostRouting } from "./host-routing";
import { resetPublicSiteCache } from "./public-hosts";

function createRequest(host: string, pathname: string): NextRequest {
  const url = new URL(`http://${host}${pathname}`);
  return {
    headers: new Headers({ host }),
    nextUrl: new URL(`http://${host}${pathname}`),
    url: url.href,
  } as NextRequest;
}

function expectMarketingFallbackLocation(
  location: string | null,
  expected: "http://localhost:3000" | "https://salanor.com",
): void {
  expect(location === expected || location === `${expected}/`).toBe(true);
}

describe("handleHostRouting", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
  });

  it("rewrites dev /app/console/aegis to internal /console", () => {
    const res = handleHostRouting(createRequest("localhost:3000", CONSOLE_AEGIS_BASE));
    expect(res?.headers.get("x-middleware-rewrite")).toContain("/console");
  });

  it("redirects legacy /console to /app/console/aegis on loopback", () => {
    const res = handleHostRouting(createRequest("localhost:3000", "/console"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toContain(CONSOLE_AEGIS_BASE);
  });

  it("redirects legacy app.aegis.localhost to path-based console URL", () => {
    const res = handleHostRouting(createRequest("app.aegis.localhost:3000", "/"));
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe(`http://localhost:3000${CONSOLE_AEGIS_BASE}`);
  });

  it("redirects unknown localhost subdomain to marketing fallback", () => {
    const res = handleHostRouting(createRequest("foo.localhost:3000", "/"));
    expect(res?.status).toBe(302);
    expectMarketingFallbackLocation(res?.headers.get("location"), "http://localhost:3000");
  });

  it("redirects unknown host in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    resetPublicSiteCache();
    const res = handleHostRouting(createRequest("foo.example.com", "/"));
    expect(res?.status).toBe(302);
    expectMarketingFallbackLocation(res?.headers.get("location"), "https://salanor.com");
  });

  it("rewrites app.salanor.com /console/aegis for production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    resetPublicSiteCache();
    const res = handleHostRouting(createRequest("app.salanor.com", "/console/aegis/events"));
    expect(res?.headers.get("x-middleware-rewrite")).toContain("/console/events");
  });

  it("allows localhost /aegis without redirect", () => {
    const res = handleHostRouting(createRequest("localhost:3000", "/aegis"));
    expect(res).toBeNull();
  });
});
