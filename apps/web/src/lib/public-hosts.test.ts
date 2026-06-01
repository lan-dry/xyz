import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSOLE_AEGIS_BASE, CONSOLE_AEGIS_PUBLIC_PREFIX } from "@/lib/app-paths";
import {
  getAllowedHosts,
  getConsolePublicUrl,
  getDocsPublicUrl,
  getMarketingFallbackUrl,
  isAllowedHost,
  isAppPublicHost,
  isProductionDomainUrl,
  resetPublicSiteCache,
  resolveHostAction,
  resolveHostRewritePath,
  shouldUseLocalDevProductHosts,
} from "./public-hosts";

describe("public-hosts (Pattern C)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
  });

  it("allowlists marketing, app, and docs production hosts", () => {
    const allowed = getAllowedHosts();
    expect(allowed.has("localhost")).toBe(true);
    expect(allowed.has("app.salanor.com")).toBe(true);
    expect(allowed.has("docs.salanor.com")).toBe(true);
    expect(isAllowedHost("foo.localhost:3000")).toBe(false);
  });

  it("rewrites app host console paths to internal /console routes", () => {
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    expect(resolveHostRewritePath("app.salanor.com", "/")).toBe("/console");
    expect(resolveHostRewritePath("app.salanor.com", "/console/aegis/api-keys")).toBe(
      "/console/api-keys",
    );
    expect(resolveHostAction("app.salanor.com", "/")).toEqual({
      action: "rewrite",
      pathname: "/console",
    });
  });

  it("rewrites docs host /aegis to /aegis/docs", () => {
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    expect(resolveHostRewritePath("docs.salanor.com", "/aegis")).toBe("/aegis/docs");
    expect(resolveHostRewritePath("docs.salanor.com", "/")).toBe("/aegis/docs");
  });

  it("allows loopback paths without cross-host redirects", () => {
    expect(resolveHostAction("localhost:3000", "/aegis")).toEqual({ action: "allow" });
    expect(resolveHostAction("localhost:3000", CONSOLE_AEGIS_BASE)).toEqual({ action: "allow" });
  });

  it("redirects legacy *.localhost subdomains to path-based localhost URLs", () => {
    expect(resolveHostAction("app.aegis.localhost:3000", "/")).toEqual({
      action: "redirect",
      location: `http://localhost:3000${CONSOLE_AEGIS_BASE}`,
      status: 302,
    });
    expect(resolveHostAction("aegis.localhost:3000", "/pricing")).toEqual({
      action: "redirect",
      location: "http://localhost:3000/aegis/pricing",
      status: 302,
    });
  });

  it("redirects marketing /console to app host in production", () => {
    resetPublicSiteCache();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    expect(resolveHostAction("salanor.com", "/console")).toEqual({
      action: "redirect",
      location: `https://app.salanor.com${CONSOLE_AEGIS_PUBLIC_PREFIX}`,
      status: 301,
    });
    expect(resolveHostAction("salanor.com", "/console/settings")).toEqual({
      action: "redirect",
      location: "https://app.salanor.com/console/aegis/settings",
      status: 301,
    });
  });

  it("returns dev console URL on loopback", () => {
    expect(getConsolePublicUrl("localhost:3000")).toBe(CONSOLE_AEGIS_BASE);
    expect(getDocsPublicUrl("localhost:3000")).toBe("http://localhost:3000/docs/aegis");
  });

  it("returns production console URL from marketing context", () => {
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
    expect(getConsolePublicUrl("salanor.com")).toBe(
      `https://app.salanor.com${CONSOLE_AEGIS_PUBLIC_PREFIX}`,
    );
  });

  it("blocks unknown hosts", () => {
    expect(resolveHostAction("evil.example.com", "/")).toEqual({ action: "unknown" });
  });

  it("detects loopback for local dev helpers", () => {
    expect(shouldUseLocalDevProductHosts("localhost:3000")).toBe(true);
    expect(isAppPublicHost("app.salanor.com")).toBe(true);
    expect(isProductionDomainUrl("https://salanor.com/")).toBe(true);
    expect(isProductionDomainUrl("http://localhost:3000/")).toBe(false);
  });

  it("uses marketing fallback on loopback", () => {
    expect(getMarketingFallbackUrl("localhost:3000")).toBe("http://localhost:3000");
  });
});
