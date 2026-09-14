import type pg from "pg";
import type { MerklePathStep } from "@salanor/witness-merkle";

export type InclusionProofRow = {
  proof_id: string;
  event_id: string;
  root_id: string;
  organization_id: string;
  merkle_path: MerklePathStep[];
  leaf_index: number;
  root_hash: string;
  tree_size: number;
};

export async function getInclusionProofByEvent(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  eventId: string,
): Promise<InclusionProofRow | null> {
  const result = await client.query<{
    proof_id: string;
    event_id: string;
    root_id: string;
    organization_id: string;
    merkle_path: MerklePathStep[];
    leaf_index: number;
    root_hash: string;
    tree_size: number;
  }>(
    `SELECT p.proof_id, p.event_id, p.root_id, p.organization_id,
            p.merkle_path, p.leaf_index, r.root_hash, r.tree_size
     FROM inclusion_proof p
     JOIN merkle_root r ON r.root_id = p.root_id
     WHERE p.organization_id = $1 AND p.event_id = $2`,
    [organizationId, eventId],
  );
  return result.rows[0] ?? null;
}
