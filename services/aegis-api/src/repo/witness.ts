import type pg from "pg";
import type { MerklePathStep } from "@salanor/witness-merkle";
import type { RootTimestamp } from "../witness/root-timestamp.js";

export type InclusionProofRow = {
  proof_id: string;
  event_id: string;
  root_id: string;
  organization_id: string;
  merkle_path: MerklePathStep[];
  leaf_index: number;
  root_hash: string;
  tree_size: number;
  sig_value_b64: string | null;
  sig_key_id: string | null;
  anchoring_type: string | null;
  external_tx_id: string | null;
  timestamp: RootTimestamp | null;
};

function mapTimestamp(row: {
  root_id: string;
  tsa_status: string | null;
  tsa_authority: string | null;
  tsa_url: string | null;
  tsa_gen_time: Date | null;
  tsa_token_b64: string | null;
  tsa_message_hash: string | null;
  root_hash: string;
}): RootTimestamp | null {
  if (!row.tsa_status && !row.tsa_token_b64) return null;
  const hex = row.root_hash.replace(/^sha256:/i, "").toLowerCase();
  return {
    root_id: row.root_id,
    status: row.tsa_status === "stamped" ? "stamped" : "pending",
    authority: row.tsa_authority,
    tsa_url: row.tsa_url,
    gen_time_utc: row.tsa_gen_time ? row.tsa_gen_time.toISOString() : null,
    message_hash: row.tsa_message_hash ?? `sha256:${hex}`,
    token_b64: row.tsa_token_b64,
  };
}

export async function getInclusionProofByEvent(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  eventId: string,
): Promise<InclusionProofRow | null> {
  try {
    const result = await client.query<{
      proof_id: string;
      event_id: string;
      root_id: string;
      organization_id: string;
      merkle_path: MerklePathStep[];
      leaf_index: number;
      root_hash: string;
      tree_size: number;
      sig_value_b64: string | null;
      sig_key_id: string | null;
      anchoring_type: string | null;
      external_tx_id: string | null;
      tsa_status: string | null;
      tsa_authority: string | null;
      tsa_url: string | null;
      tsa_gen_time: Date | null;
      tsa_token_b64: string | null;
      tsa_message_hash: string | null;
    }>(
      `SELECT p.proof_id, p.event_id, p.root_id, p.organization_id,
              p.merkle_path, p.leaf_index, r.root_hash, r.tree_size,
              r.sig_value_b64, r.sig_key_id, r.anchoring_type, r.external_tx_id,
              r.tsa_status, r.tsa_authority, r.tsa_url, r.tsa_gen_time,
              r.tsa_token_b64, r.tsa_message_hash
       FROM inclusion_proof p
       JOIN merkle_root r ON r.root_id = p.root_id
       WHERE p.organization_id = $1 AND p.event_id = $2`,
      [organizationId, eventId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      proof_id: row.proof_id,
      event_id: row.event_id,
      root_id: row.root_id,
      organization_id: row.organization_id,
      merkle_path: row.merkle_path,
      leaf_index: row.leaf_index,
      root_hash: row.root_hash,
      tree_size: row.tree_size,
      sig_value_b64: row.sig_value_b64,
      sig_key_id: row.sig_key_id,
      anchoring_type: row.anchoring_type,
      external_tx_id: row.external_tx_id,
      timestamp: mapTimestamp(row),
    };
  } catch (err) {
    // Pre-A5 schema: tsa_* columns missing — fall back to the original select.
    if ((err as { code?: string }).code !== "42703") throw err;
    const result = await client.query<{
      proof_id: string;
      event_id: string;
      root_id: string;
      organization_id: string;
      merkle_path: MerklePathStep[];
      leaf_index: number;
      root_hash: string;
      tree_size: number;
      sig_value_b64: string | null;
      sig_key_id: string | null;
      anchoring_type: string | null;
      external_tx_id: string | null;
    }>(
      `SELECT p.proof_id, p.event_id, p.root_id, p.organization_id,
              p.merkle_path, p.leaf_index, r.root_hash, r.tree_size,
              r.sig_value_b64, r.sig_key_id, r.anchoring_type, r.external_tx_id
       FROM inclusion_proof p
       JOIN merkle_root r ON r.root_id = p.root_id
       WHERE p.organization_id = $1 AND p.event_id = $2`,
      [organizationId, eventId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      timestamp: null,
    };
  }
}
