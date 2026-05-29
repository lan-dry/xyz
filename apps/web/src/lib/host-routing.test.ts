import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { CONSOLE_ATTEST_BASE } from "@/lib/app-paths";
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

  it("rewrites dev /app/console/attest to internal /console", () => {
    const res = handleHostRouting(createRequest("localhost:3000", CONSOLE_ATTEST_BASE));
    expect(res?.headers.get("x-middleware-rewrite")).toContain("/console");
  });

  it("redirects legacy /console to /app/console/attest on loopback", () => {
    const res = handleHostRouting(createRequest("localhost:3000", "/console"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toContain(CONSOLE_ATTEST_BASE);
  });

  it("redirects legacy app.attest.localhost to path-based console URL", () => {
    const res = handleHostRouting(createRequest("app.attest.localhost:3000", "/"));
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe(`http://localhost:3000${CONSOLE_ATTEST_BASE}`);
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

  it("rewrites app.salanor.com /console/attest for production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    resetPublicSiteCache();
    const res = handleHostRouting(createRequest("app.salanor.com", "/console/attest/events"));
    expect(res?.headers.get("x-middleware-rewrite")).toContain("/console/events");
  });

  it("allows localhost /attest without redirect", () => {
    const res = handleHostRouting(createRequest("localhost:3000", "/attest"));
    expect(res).toBeNull();
  });
});
