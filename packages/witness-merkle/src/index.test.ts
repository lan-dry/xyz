import { describe, expect, it } from "vitest";
import {
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
} from "./index.js";

describe("witness-merkle", () => {
  it("verifies inclusion for each leaf", () => {
    const leaves = ["a", "b", "c", "d"].map((s) =>
      Buffer.from(s).toString("hex").padEnd(64, "0"),
    );
    const { root, layers } = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const path = getMerkleProof(layers, i);
      expect(verifyMerkleProof(leaves[i]!, root, path)).toBe(true);
    }
  });

  it("fails when leaf is tampered", () => {
    const leaves = ["aa", "bb"];
    const { root, layers } = buildMerkleTree(leaves);
    const path = getMerkleProof(layers, 0);
    expect(verifyMerkleProof("tampered", root, path)).toBe(false);
  });
});
