import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("platform extraction (Stage 11)", () => {
  it("second product API scaffolded under services/insurance-api", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    expect(
      existsSync(resolve(repoRoot, "services/insurance-api/package.json")),
    ).toBe(true);
    expect(
      existsSync(resolve(repoRoot, "services/insurance-api/src/app.ts")),
    ).toBe(true);
  });

  it("Salanor ID service exists under services/id", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    expect(existsSync(resolve(repoRoot, "services/id/package.json"))).toBe(
      true,
    );
    expect(existsSync(resolve(repoRoot, "services/id/src/app.ts"))).toBe(true);
  });

  it("shared platform-auth package exists", () => {
    const root = resolve(import.meta.dirname, "../../../packages");
    expect(existsSync(resolve(root, "platform-auth/package.json"))).toBe(true);
  });
});
