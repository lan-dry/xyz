import { describe, expect, it, beforeEach } from "vitest";

import { StubAnchorProvider, computeMerkleRoot, resetStubChainForTests } from "./anchor";

describe("computeMerkleRoot", () => {
  it("is deterministic for ordered hashes", () => {
    const a = computeMerkleRoot(["aa", "bb"]);
    const b = computeMerkleRoot(["aa", "bb"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("StubAnchorProvider", () => {
  beforeEach(() => {
    resetStubChainForTests();
  });

  it("chains batch roots", async () => {
    const anchor = new StubAnchorProvider();
    const first = await anchor.anchorBatch({ merkleRoot: "root-a", eventCount: 2 });
    const second = await anchor.anchorBatch({ merkleRoot: "root-b", eventCount: 1 });
    expect(first.anchorStatus).toBe("stub");
    expect(second.localChainRoot).not.toBe(first.localChainRoot);
  });
});
