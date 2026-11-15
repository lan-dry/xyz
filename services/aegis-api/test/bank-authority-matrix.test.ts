import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETAIL_LOAN_LADDER,
  DEFAULT_RETAIL_LOAN_MATRIX,
  matchAuthorityMatrix,
  roleSatisfies,
  type AuthorityMatrixRow,
} from "../src/bank/authority-matrix.js";

function withIds(
  rows: typeof DEFAULT_RETAIL_LOAN_MATRIX,
): AuthorityMatrixRow[] {
  return rows.map((r, i) => ({ ...r, matrix_id: `m${i}` }));
}

describe("authority matrix", () => {
  const rows = withIds(DEFAULT_RETAIL_LOAN_MATRIX);
  const ladder = DEFAULT_RETAIL_LOAN_LADDER;

  it("allows retail_loan under 5M RWF (AUTH-RL)", () => {
    const m = matchAuthorityMatrix(
      rows,
      { product: "retail_loan", amount: 3_000_000, currency: "RWF" },
      ladder,
    );
    expect(m?.outcome).toBe("allow");
    expect(m?.row.rule_code).toBe("AUTH-RL");
    expect(m?.required_role).toBeNull();
  });

  it("holds 18M for credit_manager", () => {
    const m = matchAuthorityMatrix(
      rows,
      { product: "retail_loan", amount: 18_000_000, currency: "RWF" },
      ladder,
    );
    expect(m?.outcome).toBe("hold");
    expect(m?.required_role).toBe("credit_manager");
  });

  it("role or-above: manager satisfies credit_officer requirement", () => {
    expect(roleSatisfies(ladder, "credit_manager", "credit_officer")).toBe(
      true,
    );
    expect(roleSatisfies(ladder, "credit_officer", "credit_manager")).toBe(
      false,
    );
  });
});
