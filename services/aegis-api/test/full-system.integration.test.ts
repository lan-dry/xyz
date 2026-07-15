import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const demoScript = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tools/demo/full-system.mts",
);

describe("full-system demo (Stage 12)", () => {
  it("full-system.mts implements all seven blueprint steps", () => {
    const src = readFileSync(demoScript, "utf8");
    expect(src).toContain("step1ProxyAllow");
    expect(src).toContain("step2ProxyDeny");
    expect(src).toContain("step3ApprovalObligation");
    expect(src).toContain("step4WitnessAndTransparency");
    expect(src).toContain("step5PublicVerifier");
    expect(src).toContain("step6ComplianceExport");
    expect(src).toContain("step7SiemOtlp");
    expect(src).toContain("verifyPublicBundle");
  });
});
