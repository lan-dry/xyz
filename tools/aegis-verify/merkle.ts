/**
 * Standalone Merkle helpers for offline inclusion checks (no workspace imports).
 * Rule: leaf = event hash string; node = SHA-256(UTF-8 of left hex + right hex).
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

export function checkpointSigningMessage(rootHashHex: string): Uint8Array {
  return createHash("sha256")
    .update(rootHashHex.trim().toLowerCase(), "utf8")
    .digest();
}
