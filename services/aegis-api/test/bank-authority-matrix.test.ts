import { describe, expect, it } from "vitest";
import {
  matchAuthorityMatrix,
  roleSatisfies,
} from "../src/bank/authority-matrix.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";

describe("authority matrix (from demo.banking pack)", () => {
  const pack = loadDemoPack("banking");
  const rows = packMatrixRows(pack);
  const ladder = packRoles(pack);

  it("pack is labelled demo_only", () => {
    expect(pack.demo_only).toBe(true);
    expect(pack.id).toBe("demo.banking");
  });

  it("allows retail_loan under configured low band", () => {
    const currency = pack.currencies[0]!;
    const m = matchAuthorityMatrix(
      rows,
      { product: "retail_loan", amount: 3_000_000, currency },
      ladder,
    );
    expect(m?.outcome).toBe("allow");
    expect(m?.row.rule_code).toBe("AUTH-RL-1");
    expect(m?.required_role).toBeNull();
  });

  it("holds mid-band for configured role", () => {
    const currency = pack.currencies[0]!;
    const m = matchAuthorityMatrix(
      rows,
      { product: "retail_loan", amount: 18_000_000, currency },
      ladder,
    );
    expect(m?.outcome).toBe("hold");
    expect(m?.required_role).toBe("credit_manager");
  });

  it("role or-above from pack ladder", () => {
    expect(roleSatisfies(ladder, "credit_manager", "credit_officer")).toBe(
      true,
    );
    expect(roleSatisfies(ladder, "credit_officer", "credit_manager")).toBe(
      false,
    );
  });
});
