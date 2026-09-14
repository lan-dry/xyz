import { createHash } from "node:crypto";

/** FR-ATT-LEDGER-MERKLE — binary Merkle root over event_hash strings (order preserved). */
export function computeMerkleRoot(eventHashes: string[]): string {
  if (eventHashes.length === 0) {
    return createHash("sha256").update("empty-batch", "utf8").digest("hex");
  }
  let layer = eventHashes.map((h) => createHash("sha256").update(h, "utf8").digest("hex"));
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(createHash("sha256").update(`${left}${right}`, "utf8").digest("hex"));
    }
    layer = next;
  }
  return layer[0]!;
}
