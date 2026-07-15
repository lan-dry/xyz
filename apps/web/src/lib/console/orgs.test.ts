import { describe, expect, it } from "vitest";

import {
  isValidOrganizationSlug,
  normalizeOrganizationSlug,
  slugifyOrganizationSlug,
  validateOrganizationName,
} from "./orgs";

describe("organization slug validation", () => {
  it("normalizes slug to lowercase", () => {
    expect(normalizeOrganizationSlug("  My-Team  ")).toBe("my-team");
  });

  it("slugifies name-like input", () => {
    expect(slugifyOrganizationSlug("  Acme   Security !! Team ")).toBe("acme-security-team");
  });

  it("accepts lowercase alphanumeric with hyphens", () => {
    expect(isValidOrganizationSlug("acme")).toBe(true);
    expect(isValidOrganizationSlug("acme-dev-01")).toBe(true);
  });

  it("rejects invalid slug shapes", () => {
    expect(isValidOrganizationSlug("A")).toBe(false);
    expect(isValidOrganizationSlug("ab")).toBe(false);
    expect(isValidOrganizationSlug("-acme")).toBe(false);
    expect(isValidOrganizationSlug("acme-")).toBe(false);
    expect(isValidOrganizationSlug("acme_team")).toBe(false);
    expect(isValidOrganizationSlug("acme.team")).toBe(false);
  });
});

describe("organization name validation", () => {
  it("accepts trimmed valid names", () => {
    expect(validateOrganizationName("  Acme Corporation ")).toBe("Acme Corporation");
  });

  it("rejects short or empty names", () => {
    expect(validateOrganizationName("")).toBeNull();
    expect(validateOrganizationName("A")).toBeNull();
  });
});
