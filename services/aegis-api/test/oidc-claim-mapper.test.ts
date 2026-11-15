import { describe, expect, it } from "vitest";
import { mapOidcClaimsToRoles } from "../src/auth/oidc-claim-mapper.js";

describe("mapOidcClaimsToRoles", () => {
  it("maps console roles and picks highest privilege", () => {
    const mapped = mapOidcClaimsToRoles(
      { roles: ["viewer", "admin", "approver"] },
      { roleMap: undefined },
    );
    expect(mapped.consoleRole).toBe("admin");
    expect(mapped.matchedClaims).toContain("admin");
  });

  it("maps bank roles with bank: prefix", () => {
    const mapped = mapOidcClaimsToRoles({
      roles: ["credit_manager", "approver"],
    });
    expect(mapped.consoleRole).toBe("approver");
    expect(mapped.bankRoles).toContain("credit_manager");
  });

  it("reads Keycloak realm_access.roles", () => {
    const mapped = mapOidcClaimsToRoles({
      realm_access: { roles: ["auditor"] },
    });
    expect(mapped.consoleRole).toBe("auditor");
  });

  it("applies custom claim name + map", () => {
    const mapped = mapOidcClaimsToRoles(
      { groups: ["Aegis-Admins"] },
      {
        roleClaim: "groups",
        roleMap: { "aegis-admins": "admin" },
      },
    );
    expect(mapped.consoleRole).toBe("admin");
  });

  it("defaults to viewer when no match", () => {
    const mapped = mapOidcClaimsToRoles({ roles: ["unknown-group"] });
    expect(mapped.consoleRole).toBe("viewer");
    expect(mapped.bankRoles).toEqual([]);
  });
});
