import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  buildMerkleTree,
  getMerkleProof,
} from "@salanor/witness-merkle";

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

  await client.query("BEGIN");

  try {
    await client.query(
      `INSERT INTO merkle_root (
         root_id, organization_id, root_hash, tree_size,
         interval_start, interval_end, anchoring_type, published
       ) VALUES ($1, $2, $3, $4, $5, $6, 'internal', true)`,
      [rootId, organizationId, root, size, intervalStart, intervalEnd],
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

