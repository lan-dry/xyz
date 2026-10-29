import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  buildMerkleTree,
  getMerkleProof,
} from "@salanor/witness-merkle";
import { signWitnessCheckpoint } from "./sign-checkpoint.js";

export async function runWitnessBatchForOrg(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ root_id: string; root_hash: string; tree_size: number } | null> {
  const pending = await client.query<{
    event_id: string;
    event_hash: string;
    emitted_at: Date;
  }>(
    `SELECT e.event_id, e.event_hash, e.emitted_at
     FROM event e
     WHERE e.organization_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM inclusion_proof p WHERE p.event_id = e.event_id
       )
     ORDER BY e.emitted_at ASC, e.event_id ASC`,
    [organizationId],
  );

  if (pending.rows.length === 0) {
    return null;
  }

  const leaves = pending.rows.map((r) => r.event_hash);
  const { root, layers, size } = buildMerkleTree(leaves);

  const intervalStart = pending.rows[0]!.emitted_at;
  const intervalEnd = pending.rows[pending.rows.length - 1]!.emitted_at;
  const rootId = `root_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const checkpointSig = await signWitnessCheckpoint(root);
  const publishedAt = new Date();

  await client.query("BEGIN");

  try {
    await client.query(
      `INSERT INTO merkle_root (
         root_id, organization_id, root_hash, tree_size,
         interval_start, interval_end, anchoring_type, published, published_at,
         sig_value_b64, sig_key_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'internal', true, $7, $8, $9)`,
      [
        rootId,
        organizationId,
        root,
        size,
        intervalStart,
        intervalEnd,
        publishedAt,
        checkpointSig?.sig_value_b64 ?? null,
        checkpointSig?.sig_key_id ?? null,
      ],
    );

    for (let i = 0; i < pending.rows.length; i++) {
      const row = pending.rows[i]!;
      const path = getMerkleProof(layers, i);
      const proofId = `prf_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await client.query(
        `INSERT INTO inclusion_proof (
           proof_id, event_id, root_id, organization_id, merkle_path, leaf_index
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [proofId, row.event_id, rootId, organizationId, JSON.stringify(path), i],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  return { root_id: rootId, root_hash: root, tree_size: size };
}

/** Backfill signatures on roots created before checkpoint signing was enabled. */
export async function backfillUnsignedCheckpoints(
  client: pg.Pool | pg.PoolClient,
  organizationId?: string,
): Promise<number> {
  const result = await client.query<{ root_id: string; root_hash: string }>(
    organizationId
      ? `SELECT root_id, root_hash FROM merkle_root
         WHERE organization_id = $1 AND sig_value_b64 IS NULL
         ORDER BY interval_end ASC`
      : `SELECT root_id, root_hash FROM merkle_root
         WHERE sig_value_b64 IS NULL
         ORDER BY interval_end ASC`,
    organizationId ? [organizationId] : [],
  );

  let signed = 0;
  for (const row of result.rows) {
    const checkpointSig = await signWitnessCheckpoint(row.root_hash);
    if (!checkpointSig) break;
    await client.query(
      `UPDATE merkle_root
       SET sig_value_b64 = $2,
           sig_key_id = $3,
           published = true,
           published_at = COALESCE(published_at, now())
       WHERE root_id = $1 AND sig_value_b64 IS NULL`,
      [row.root_id, checkpointSig.sig_value_b64, checkpointSig.sig_key_id],
    );
    signed += 1;
  }
  return signed;
}

export async function listOrganizationIds(
  client: pg.Pool | pg.PoolClient,
): Promise<string[]> {
  const result = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization ORDER BY created_at ASC`,
  );
  return result.rows.map((r) => r.organization_id);
}
