import { describe, expect, it } from "vitest";

import {
  OTS_BITCOIN_BLOCK_MAGIC,
  hasBitcoinBlockConfirmation,
  isOpenTimestampsProof,
  verifyOtsProof,
} from "./ots-verify";

describe("ots-verify", () => {
  it("detects bitcoin confirmation tag in proof bytes", () => {
    const proof = Buffer.concat([
      Buffer.from("\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94", "binary"),
      OTS_BITCOIN_BLOCK_MAGIC,
    ]);
    expect(hasBitcoinBlockConfirmation(proof)).toBe(true);
    expect(isOpenTimestampsProof(proof)).toBe(true);
  });

  it("returns pending for calendar-free stub proof without bitcoin tag", async () => {
    const proof = Buffer.from("\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94", "binary");
    const result = await verifyOtsProof({
      merkleRootHex: "a".repeat(64),
      proof,
    });
    expect(result.status).toBe("pending");
  });

  it("returns anchored when bitcoin tag is present", async () => {
    const proof = Buffer.concat([
      Buffer.from("\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94", "binary"),
      OTS_BITCOIN_BLOCK_MAGIC,
    ]);
    const result = await verifyOtsProof({
      merkleRootHex: "b".repeat(64),
      proof,
    });
    expect(result.status).toBe("anchored");
  });
});
