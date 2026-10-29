import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("kill switch", () => {
  it("evaluateToolPolicy denies suspended agents with decision_layer agent", () => {
    const src = readFileSync(
      join(process.cwd(), "src/policy/evaluate.ts"),
      "utf8",
    );
    expect(src).toContain('decision_layer: "agent"');
    expect(src).toContain("is suspended (kill switch)");
  });
});
