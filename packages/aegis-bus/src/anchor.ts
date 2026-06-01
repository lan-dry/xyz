import { createHash } from "node:crypto";

export { computeMerkleRoot } from "@salanor/aegis-ledger-sdk/merkle";

/** FR-AEG-ANCHOR-OTS — stub | pending (OTS submitted) | anchored (confirmed). */
export type AnchorStatus = "pending" | "stub" | "anchored";

export interface AnchorBatchInput {
  merkleRoot: string;
  eventCount: number;
}

export interface AnchorBatchResult {
  anchorStatus: AnchorStatus;
  anchorRef: string | null;
  localChainRoot: string;
  otsBlobKey?: string | null;
}

export interface AnchorProvider {
  anchorBatch(input: AnchorBatchInput): Promise<AnchorBatchResult>;
}

let stubChainTip: string | null = null;

/** Local hash-chain root per batch (P3 stub). */
export class StubAnchorProvider implements AnchorProvider {
  async anchorBatch(input: AnchorBatchInput): Promise<AnchorBatchResult> {
    const payload = `${stubChainTip ?? "genesis"}|${input.merkleRoot}|${input.eventCount}`;
    const localChainRoot = createHash("sha256").update(payload, "utf8").digest("hex");
    stubChainTip = localChainRoot;
    return {
      anchorStatus: "stub",
      anchorRef: `stub:${localChainRoot.slice(0, 16)}`,
      localChainRoot,
    };
  }
}

export function resetStubChainForTests(): void {
  stubChainTip = null;
}
