import { describe, expect, it } from "vitest";
import {
  applyFieldPolicy,
  findLeakedClearValues,
  hashValue,
} from "../src/bank/field-policy.js";

describe("field policy", () => {
  const nationalId = "1199780012345678";

  it("masks, hashes, omits, and evaluate_only", () => {
    const result = applyFieldPolicy(
      {
        national_id: nationalId,
        purpose: "kyc_review",
        secret_score: 0.91,
        note: "keep",
      },
      [
        { field_path: "national_id", mode: "mask", mask_keep_last: 4 },
        { field_path: "secret_score", mode: "evaluate_only" },
        { field_path: "purpose", mode: "store" },
      ],
    );

    expect(result.stored.national_id).toBe("************5678");
    expect(result.stored.national_id).not.toBe(nationalId);
    expect(result.stored).not.toHaveProperty("secret_score");
    expect(result.for_evaluate.secret_score).toBe(0.91);
    expect(result.for_evaluate.national_id).toBe(nationalId);
    expect(result.stored.purpose).toBe("kyc_review");
  });

  it("hash mode never stores clear value", () => {
    const result = applyFieldPolicy(
      { national_id: nationalId },
      [{ field_path: "national_id", mode: "hash" }],
    );
    expect(result.stored.national_id).toBe(hashValue(nationalId));
    expect(String(result.stored.national_id)).not.toContain(nationalId);
  });

  it("detects clear national id leaks", () => {
    const leaks = findLeakedClearValues(
      JSON.stringify({ national_id: nationalId }),
      [nationalId],
    );
    expect(leaks).toEqual([nationalId]);
    const clean = findLeakedClearValues(
      JSON.stringify(
        applyFieldPolicy(
          { national_id: nationalId },
          [{ field_path: "national_id", mode: "hash" }],
        ).stored,
      ),
      [nationalId],
    );
    expect(clean).toEqual([]);
  });
});
