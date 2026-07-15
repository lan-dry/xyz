/**
 * Standalone Merkle helpers (no @salanor imports — third-party verifier).
 */
import { createHash } from "node:crypto";

export type MerklePathStep = {
  sibling: string;
  position: "left" | "right";
};

export function hashPair(left: string, right: string): string {
  return createHash("sha256").update(left + right, "utf8").digest("hex");
}

export function verifyMerkleProof(
  leafHash: string,
  rootHash: string,
  path: MerklePathStep[],
): boolean {
  let current = leafHash;
  for (const step of path) {
    current =
      step.position === "right"
        ? hashPair(current, step.sibling)
        : hashPair(step.sibling, current);
  }
  return current === rootHash;
}

export function transparencyLeafHash(input: {
  organizationId: string;
  logIndex: number;
  eventId: string;
  eventHash: string;
  rootId: string;
}): string {
  const body = [
    "APS-TL1",
    input.organizationId,
    String(input.logIndex),
    input.eventId,
    input.eventHash,
    input.rootId,
  ].join("\n");
  return createHash("sha256").update(body, "utf8").digest("hex");
}
