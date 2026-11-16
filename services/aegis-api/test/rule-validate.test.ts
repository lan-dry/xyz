import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validatePolicyRule,
  validatePolicyRules,
} from "../src/bank/rule-validate.js";
import { loadDemoPack } from "../src/packs/load.js";

describe("B1 rule validation", () => {
  it("rejects unknown condition keys", () => {
    const issues = validatePolicyRule({
      rule_id: "r1",
      tool_pattern: "governed.action",
      decision: "allow_with_obligation",
      conditions: { totally_unknown_key: 1 },
    });
    expect(issues.some((i) => i.code === "unknown_condition_key")).toBe(true);
  });

  it("rejects unknown obligation kinds", () => {
    const issues = validatePolicyRule({
      rule_id: "r1",
      tool_pattern: "governed.action",
      decision: "allow_with_obligation",
      obligations: { kind: "telepathy" },
    });
    expect(issues.some((i) => i.code === "unknown_obligation_kind")).toBe(true);
  });

  it("accepts amount_gte and human_approval", () => {
    const issues = validatePolicyRule({
      rule_id: "r_v4",
      tool_pattern: "governed.action",
      decision: "allow_with_obligation",
      conditions: {
        amount_gte: 15_000_000,
        obligations: { kind: "human_approval", required_role: "credit_manager" },
      },
    });
    expect(issues).toEqual([]);
  });

  it("accepts require_approval as a known obligation kind", () => {
    const issues = validatePolicyRule({
      rule_id: "r1",
      tool_pattern: "governed.action",
      decision: "allow_with_obligation",
      obligations: { type: "require_approval" },
    });
    expect(issues).toEqual([]);
  });

  it("validates every shipped demo pack", () => {
    for (const packId of ["banking", "insurance"] as const) {
      const pack = loadDemoPack(packId);
      const issues = validatePolicyRules(
        pack.rules.map((r) => ({
          rule_id: r.rule_id,
          tool_pattern: r.tool_pattern,
          decision: r.decision,
          priority: r.priority,
          conditions: r.conditions ?? null,
          obligations: (r as { obligations?: unknown }).obligations,
        })),
      );
      expect(issues, `pack ${packId}`).toEqual([]);
    }
  });

  it("validates pack JSON files under packs/demo", () => {
    const root = join(
      dirname(fileURLToPath(import.meta.url)),
      "../src/packs/demo",
    );
    for (const dir of readdirSync(root)) {
      const packPath = join(root, dir, "pack.json");
      try {
        const raw = JSON.parse(readFileSync(packPath, "utf8")) as {
          rules?: Array<Record<string, unknown>>;
        };
        const issues = validatePolicyRules(
          (raw.rules ?? []).map((r) => ({
            rule_id: String(r.rule_id ?? ""),
            tool_pattern: String(r.tool_pattern ?? ""),
            decision: String(r.decision ?? ""),
            priority: Number(r.priority ?? 0),
            conditions: r.conditions,
            obligations: r.obligations,
          })),
        );
        expect(issues, packPath).toEqual([]);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
    }
  });
});
