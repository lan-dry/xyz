import { describe, expect, it } from "vitest";
import { hashPair, verifyMerkleProof } from "./merkle.ts";

describe("aegis-verify merkle", () => {
  it("hashes left hex followed by right hex", () => {
    const left = "aa";
    const right = "bb";
    expect(hashPair(left, right)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPair(left, right)).not.toBe(hashPair(right, left));
  });

  it("verifies a two-leaf path", () => {
    const leaves = ["sha256:leaf0", "sha256:leaf1"];
    const root = hashPair(leaves[0]!, leaves[1]!);
    expect(
      verifyMerkleProof(leaves[0]!, root, [
        { sibling: leaves[1]!, position: "right" },
      ]),
    ).toBe(true);
    expect(
      verifyMerkleProof(leaves[0]!, root, [
        { sibling: "deadbeef", position: "right" },
      ]),
    ).toBe(false);
  });
});
