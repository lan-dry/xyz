import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSOLE_AEGIS_BASE } from "@/lib/app-paths";
import {
  getClientAegisProductUrl,
  getClientConsolePublicUrl,
  getClientDocsPublicUrl,
  getClientMarketingHomeUrl,
  resolveEffectiveRequestHost,
} from "./client-public-url";
import { resetPublicSiteCache } from "./public-hosts";

describe("client-public-url", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
    vi.stubEnv("PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPublicSiteCache();
  });

  it("resolves request host hints", () => {
    expect(resolveEffectiveRequestHost("localhost:3000")).toBe("localhost:3000");
  });

  it("uses path-based localhost URLs in dev", () => {
    expect(getClientAegisProductUrl("localhost:3000")).toBe("http://localhost:3000/aegis");
    expect(getClientConsolePublicUrl("localhost:3000")).toBe(CONSOLE_AEGIS_BASE);
    expect(getClientDocsPublicUrl("localhost:3000")).toBe("http://localhost:3000/docs/aegis");
    expect(getClientMarketingHomeUrl("localhost:3000")).toBe("http://localhost:3000");
  });

  it("uses production-shaped relative paths when env is salanor.com", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://salanor.com");
    expect(getClientAegisProductUrl()).toBe("/aegis");
    expect(getClientConsolePublicUrl()).toBe("/console/aegis");
    expect(getClientDocsPublicUrl()).toBe("https://docs.salanor.com/aegis");
  });
});
