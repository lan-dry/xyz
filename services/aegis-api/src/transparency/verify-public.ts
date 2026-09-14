import { verifyMerkleProof } from "@salanor/witness-merkle";
import type { PublicVerificationBundle } from "./bundle.js";
import { transparencyLeafHash } from "./leaf-hash.js";

export type PublicVerificationResult = {
  ok: boolean;
  witness_ok: boolean;
  transparency_ok: boolean;
  leaf_ok: boolean;
  errors: string[];
};

export function verifyPublicVerificationBundle(
  bundle: PublicVerificationBundle,
): PublicVerificationResult {
  const errors: string[] = [];

  const witnessOk = verifyMerkleProof(
    bundle.event_hash,
    bundle.witness.root_hash,
    bundle.witness.merkle_path,
  );
  if (!witnessOk) errors.push("witness merkle inclusion failed");

  const transparencyOk = verifyMerkleProof(
    bundle.transparency.leaf_hash,
    bundle.transparency.log_root_hash,
    bundle.transparency.log_merkle_path,
  );
  if (!transparencyOk) errors.push("transparency log merkle inclusion failed");

  const expectedLeaf = transparencyLeafHash({
    organizationId: bundle.organization_id,
    logIndex: bundle.transparency.log_index,
    eventId: bundle.event_id,
    eventHash: bundle.event_hash,
    rootId: bundle.witness.root_id,
  });
  const leafOk = bundle.transparency.leaf_hash === expectedLeaf;
  if (!leafOk) errors.push("transparency leaf hash mismatch");

  const ok = witnessOk && transparencyOk && leafOk;
  return { ok, witness_ok: witnessOk, transparency_ok: transparencyOk, leaf_ok: leafOk, errors };
}
