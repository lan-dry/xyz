import { createHash } from "node:crypto";

export type MerklePathStep = {
  sibling: string;
  /** Sibling position relative to the running hash (leaf starts as left when `right`). */
  position: "left" | "right";
};

export function hashPair(left: string, right: string): string {
  return createHash("sha256").update(left + right, "utf8").digest("hex");
}

export function buildMerkleTree(leaves: string[]): {
  root: string;
  layers: string[][];
  size: number;
} {
  if (leaves.length === 0) {
    return { root: "", layers: [[]], size: 0 };
  }

  const layers: string[][] = [[...leaves]];
  let current = [...leaves];

  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1] ?? left;
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }

  return { root: current[0]!, layers, size: leaves.length };
}

export function getMerkleProof(
  layers: string[][],
  leafIndex: number,
): MerklePathStep[] {
  const path: MerklePathStep[] = [];
  let index = leafIndex;

  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level]!;
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling = layer[siblingIndex] ?? layer[index]!;
    path.push({
      sibling,
      position: index % 2 === 0 ? "right" : "left",
    });
    index = Math.floor(index / 2);
  }

  return path;
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
