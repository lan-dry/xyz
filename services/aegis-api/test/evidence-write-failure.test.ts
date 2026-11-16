/**
 * F13: when the gate/evidence record fails, policy evaluate must not return
 * a usable 200 final decision. Client treats evidence_status=failed as unreachable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("F13 evidence write failure contracts", () => {
  it("policy-evaluate fail-safe by default (503 unless opt-out=0)", () => {
    const src = readFileSync(
      join(root, "src/routes/policy-evaluate.ts"),
      "utf8",
    );
    expect(src).toMatch(/evidence_status:\s*"failed"/);
    expect(src).toMatch(/AEGIS_ENFORCE_REQUIRE_EVIDENCE === "0"/);
    expect(src).toMatch(/optOut \? 200 : 503/);
    expect(src).toMatch(/policy evaluate record failed/);
  });

  it("default enforce is fail-safe (not opt-in)", () => {
    const src = readFileSync(
      join(root, "src/routes/policy-evaluate.ts"),
      "utf8",
    );
    // Must not require === "1" to enable 503 (that was the unsafe Pass-1 default).
    expect(src).not.toMatch(
      /AEGIS_ENFORCE_REQUIRE_EVIDENCE === "1"[\s\S]{0,80}503/,
    );
  });

  it("SDK policy-client rejects evidence_status failed", () => {
    const src = readFileSync(
      join(root, "../../sdks/typescript/src/proxy/policy-client.ts"),
      "utf8",
    );
    expect(src).toMatch(/evidence_status === "failed"/);
    expect(src).toMatch(/throw new Error/);
  });

  it("bank enforce path flags evidence_status failed when receipt write fails", () => {
    const src = readFileSync(join(root, "src/bank/handle-event.ts"), "utf8");
    expect(src).toMatch(/evidence_status:\s*"failed"/);
    expect(src).toMatch(/AEGIS_ENFORCE_REQUIRE_EVIDENCE/);
  });
});

describe("F13 client reaction (simulate evaluatePolicyViaApi)", () => {
  it("503 with evidence_status failed throws (unreachable)", async () => {
    // Inline the same guard the SDK uses so the suite does not depend on SDK build.
    async function evaluateGuard(
      res: Response,
    ): Promise<{ decision: string }> {
      const body = (await res.json()) as {
        decision?: string;
        evidence_status?: string;
        record_error?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          `Policy evaluate failed (${res.status}): ${
            body.evidence_status === "failed"
              ? `evidence_status=failed ${body.record_error ?? ""}`.trim()
              : (body.error ?? "error")
          }`,
        );
      }
      if (body.evidence_status === "failed") {
        throw new Error(`evidence_status=failed: ${body.record_error}`);
      }
      return { decision: body.decision ?? "allow" };
    }

    await expect(
      evaluateGuard(
        new Response(
          JSON.stringify({
            decision: "allow_with_obligation",
            evidence_status: "failed",
            record_error: "No Workflow Bridge signing key",
          }),
          { status: 503 },
        ),
      ),
    ).rejects.toThrow(/evidence_status=failed/);
  });
});
