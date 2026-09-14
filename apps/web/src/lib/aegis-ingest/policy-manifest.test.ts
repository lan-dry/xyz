import { describe, expect, it } from "vitest";

import { createPolicyManifest, verifyPolicyManifest } from "./policy-manifest";

const SIGNING_KEY = "test-signing-key";

const RULES = {
  version: "1",
  deny_if_missing_actor: true,
  require_fields: ["actor.id", "context.outcome"],
  max_payload_bytes: 32768,
};

describe("policy manifest signing", () => {
  it("verifies a signed manifest roundtrip", () => {
    const manifest = createPolicyManifest({
      organizationId: "org-1",
      policyId: "policy-1",
      name: "Default policy",
      version: 1,
      rules: RULES,
      createdAt: "2026-05-16T12:00:00.000Z",
      signingKey: SIGNING_KEY,
    });

    const result = verifyPolicyManifest(manifest, SIGNING_KEY);
    expect(result.ok).toBe(true);
  });

  it("detects tampered rules", () => {
    const manifest = createPolicyManifest({
      organizationId: "org-1",
      policyId: "policy-1",
      name: "Default policy",
      version: 1,
      rules: RULES,
      createdAt: "2026-05-16T12:00:00.000Z",
      signingKey: SIGNING_KEY,
    });
    const tampered = {
      ...manifest,
      rules: {
        ...manifest.rules,
        max_payload_bytes: 1000,
      },
    };
    const result = verifyPolicyManifest(tampered, SIGNING_KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/rules_sha256|signature/i);
    }
  });
});
