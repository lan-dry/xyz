import {
  buildMerkleTree,
  getMerkleProof,
  type MerklePathStep,
} from "@salanor/witness-merkle";
import type pg from "pg";
import { getInclusionProofByEvent } from "../repo/witness.js";
import { transparencyLeafHash } from "./leaf-hash.js";

export type PublicVerificationBundle = {
  organization_id: string;
  organization_slug: string;
  event_id: string;
  event_hash: string;
  witness: {
    root_id: string;
    root_hash: string;
    tree_size: number;
    leaf_index: number;
    merkle_path: MerklePathStep[];
  };
  transparency: {
    entry_id: string;
    log_index: number;
    leaf_hash: string;
    log_root_hash: string;
    log_tree_size: number;
    log_merkle_path: MerklePathStep[];
  };
};

export async function buildPublicVerificationBundle(
  client: pg.Pool | pg.PoolClient,
  organizationSlug: string,
  eventId: string,
): Promise<PublicVerificationBundle | null> {
  const orgResult = await client.query<{
    organization_id: string;
    slug: string;
  }>(
    `SELECT organization_id, slug FROM organization WHERE slug = $1`,
    [organizationSlug],
  );
  const org = orgResult.rows[0];
  if (!org) return null;

  const witness = await getInclusionProofByEvent(
    client,
    org.organization_id,
    eventId,
  );
  if (!witness) return null;

  const eventResult = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM event WHERE event_id = $1 AND organization_id = $2`,
    [eventId, org.organization_id],
  );
  const eventHash = eventResult.rows[0]?.event_hash;
  if (!eventHash) return null;

  const entryResult = await client.query<{
    entry_id: string;
    log_index: string;
    leaf_hash: string;
    root_id: string;
  }>(
    `SELECT entry_id, log_index, leaf_hash, root_id
     FROM transparency_log_entry
     WHERE organization_id = $1 AND event_id = $2`,
    [org.organization_id, eventId],
  );
  const entry = entryResult.rows[0];
  if (!entry) return null;

  const leavesResult = await client.query<{ leaf_hash: string }>(
    `SELECT leaf_hash FROM transparency_log_entry
     WHERE organization_id = $1
     ORDER BY log_index ASC`,
    [org.organization_id],
  );
  const leaves = leavesResult.rows.map((r) => r.leaf_hash);
  const logIndex = Number(entry.log_index);
  const { root: logRoot, layers } = buildMerkleTree(leaves);
  const logPath = getMerkleProof(layers, logIndex);

  const expectedLeaf = transparencyLeafHash({
    organizationId: org.organization_id,
    logIndex,
    eventId,
    eventHash,
    rootId: entry.root_id,
  });
  if (expectedLeaf !== entry.leaf_hash) {
    return null;
  }

  return {
    organization_id: org.organization_id,
    organization_slug: org.slug,
    event_id: eventId,
    event_hash: eventHash,
    witness: {
      root_id: witness.root_id,
      root_hash: witness.root_hash,
      tree_size: witness.tree_size,
      leaf_index: witness.leaf_index,
      merkle_path: witness.merkle_path,
    },
    transparency: {
      entry_id: entry.entry_id,
      log_index: logIndex,
      leaf_hash: entry.leaf_hash,
      log_root_hash: logRoot,
      log_tree_size: leaves.length,
      log_merkle_path: logPath,
    },
  };
}
