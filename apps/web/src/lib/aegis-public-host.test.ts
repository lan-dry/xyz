import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAegisPublicHost,
  isAegisProductSurface,
  resolveAegisHostRewrite,
} from "./aegis-public-host";
import { resetPublicSiteCache } from "./public-hosts";

describe("aegis-public-host", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "https://salanor.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
  });

  it("uses marketing host for aegis product paths in Pattern C", () => {
    expect(getAegisPublicHost()).toBe("salanor.com");
    expect(isAegisProductSurface("localhost:3000", "/aegis")).toBe(true);
    expect(resolveAegisHostRewrite("docs.salanor.com", "/aegis")).toBe("/aegis/docs");
  });
});
