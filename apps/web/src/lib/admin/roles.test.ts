import { describe, expect, it } from "vitest";

import {
  AdminForbiddenError,
  canWriteAdminCms,
  canWriteAdminContacts,
  hasAdminPermission,
  requireAdminPermission,
  requireInternalRole,
} from "./roles";

describe("admin RBAC", () => {
  it("superadmin has full permissions", () => {
    expect(hasAdminPermission("superadmin", "admin:cms:write")).toBe(true);
    expect(hasAdminPermission("superadmin", "admin:users:suspend")).toBe(true);
  });

  it("eng is read-only for cms and cannot access contacts", () => {
    expect(canWriteAdminCms("eng")).toBe(false);
    expect(canWriteAdminContacts("eng")).toBe(false);
    expect(hasAdminPermission("eng", "admin:contacts:read")).toBe(false);
    expect(hasAdminPermission("eng", "admin:tenants:read")).toBe(true);
    expect(hasAdminPermission("eng", "admin:users:suspend")).toBe(false);
  });

  it("support can triage contacts but not write cms", () => {
    expect(canWriteAdminContacts("support")).toBe(true);
    expect(canWriteAdminCms("support")).toBe(false);
  });

  it("requireAdminPermission throws for eng on cms write", () => {
    expect(() => requireAdminPermission("eng", "admin:cms:write")).toThrow(AdminForbiddenError);
  });

  it("requireInternalRole enforces rank", () => {
    expect(() => requireInternalRole("support", "superadmin")).toThrow(AdminForbiddenError);
    expect(() => requireInternalRole("superadmin", "eng")).not.toThrow();
  });
});
