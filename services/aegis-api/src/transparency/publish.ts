import { randomUUID } from "node:crypto";
import type pg from "pg";
import { transparencyLeafHash } from "./leaf-hash.js";

export async function publishTransparencyLogForOrg(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ published: number; tree_size: number }> {
  const pending = await client.query<{
    event_id: string;
    event_hash: string;
    root_id: string;
  }>(
    `SELECT p.event_id, e.event_hash, p.root_id
     FROM inclusion_proof p
     JOIN event e ON e.event_id = p.event_id
     WHERE p.organization_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM transparency_log_entry t WHERE t.event_id = p.event_id
       )
     ORDER BY e.emitted_at ASC, e.event_id ASC`,
    [organizationId],
  );

  if (pending.rows.length === 0) {
    const sizeResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM transparency_log_entry WHERE organization_id = $1`,
      [organizationId],
    );
    return {
      published: 0,
      tree_size: Number(sizeResult.rows[0]?.count ?? 0),
    };
  }

  const maxResult = await client.query<{ max_index: string | null }>(
    `SELECT MAX(log_index)::text AS max_index
     FROM transparency_log_entry
     WHERE organization_id = $1`,
    [organizationId],
  );
  let nextIndex = Number(maxResult.rows[0]?.max_index ?? -1) + 1;

  await client.query("BEGIN");
  try {
    for (const row of pending.rows) {
      const entryId = `tle_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const leafHash = transparencyLeafHash({
        organizationId,
        logIndex: nextIndex,
        eventId: row.event_id,
        eventHash: row.event_hash,
        rootId: row.root_id,
      });
      await client.query(
        `INSERT INTO transparency_log_entry (
           entry_id, organization_id, event_id, root_id, log_index, leaf_hash
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          entryId,
          organizationId,
          row.event_id,
          row.root_id,
          nextIndex,
          leafHash,
        ],
      );
      nextIndex += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return { published: pending.rows.length, tree_size: nextIndex };
}
