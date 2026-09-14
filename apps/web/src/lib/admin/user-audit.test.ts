import { describe, expect, it } from "vitest";

import { adminAuditActorEmail, adminUserAuditWhere } from "./user-audit";

describe("adminUserAuditWhere", () => {
  it("filters console audit log by user target", () => {
    expect(adminUserAuditWhere("user-1")).toEqual({
      targetType: "user",
      targetId: "user-1",
    });
  });
});

describe("adminAuditActorEmail", () => {
  it("reads actorEmail from metadata", () => {
    expect(adminAuditActorEmail({ actorEmail: "ops@salanor.com", surface: "admin" })).toBe(
      "ops@salanor.com",
    );
  });

  it("returns null for invalid metadata", () => {
    expect(adminAuditActorEmail(null)).toBeNull();
    expect(adminAuditActorEmail([])).toBeNull();
  });
});
