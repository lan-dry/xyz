import { describe, expect, it } from "vitest";
import {
  DemoTenantRefusal,
  requireConfirmSlug,
} from "./demo-tenants.js";

describe("requireConfirmSlug", () => {
  it("accepts exact match", () => {
    expect(() => requireConfirmSlug("demo-bank", "demo-bank")).not.toThrow();
  });
  it("refuses mismatch", () => {
    expect(() => requireConfirmSlug("demo-bank", "other")).toThrow(DemoTenantRefusal);
    try {
      requireConfirmSlug("demo-bank", "other");
    } catch (e) {
      expect(e).toBeInstanceOf(DemoTenantRefusal);
      expect((e as DemoTenantRefusal).code).toBe("confirm_mismatch");
    }
  });
  it("refuses empty slug", () => {
    expect(() => requireConfirmSlug("", "x")).toThrow(DemoTenantRefusal);
  });
});

describe("DemoTenantRefusal codes for customer tenants", () => {
  it("documents not_wipeable code used by API on customer orgs", () => {
    const err = new DemoTenantRefusal(
      "not_wipeable",
      "tenant_wipe_refused: acme-bank is neither is_demo nor is_test",
    );
    expect(err.code).toBe("not_wipeable");
    expect(err.message).toMatch(/neither is_demo nor is_test/);
  });
});
