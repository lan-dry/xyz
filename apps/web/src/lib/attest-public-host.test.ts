import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAttestPublicHost,
  isAttestProductSurface,
  resolveAttestHostRewrite,
} from "./attest-public-host";
import { resetPublicSiteCache } from "./public-hosts";

describe("attest-public-host", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
  });

  it("uses marketing host for attest product paths in Pattern C", () => {
    expect(getAttestPublicHost()).toBe("salanor.com");
    expect(isAttestProductSurface("localhost:3000", "/attest")).toBe(true);
    expect(resolveAttestHostRewrite("docs.salanor.com", "/attest")).toBe("/attest/docs");
  });
});
