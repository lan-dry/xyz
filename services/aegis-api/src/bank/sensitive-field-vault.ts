/**
 * Clear values for field-policy "mask" paths. Stored separately so the sealed
 * case attributes stay masked; auditors may reveal with an access-log entry.
 */
import type pg from "pg";
import type { FieldPolicyRule } from "./field-policy.js";

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export async function storeMaskedFieldClears(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    caseId: string | null;
    traceId: string | null;
    eventId: string | null;
    attributes: Record<string, unknown>;
    rules: FieldPolicyRule[];
  },
): Promise<void> {
  const maskRules = input.rules.filter((r) => r.mode === "mask");
  if (maskRules.length === 0) return;

  for (const rule of maskRules) {
    const clear = getPath(input.attributes, rule.field_path);
    if (clear === undefined || clear === null) continue;
    const clearValue =
      typeof clear === "string" ? clear : JSON.stringify(clear);
    if (!clearValue) continue;
    // SAVEPOINT so a missing/mismatched vault schema cannot abort the outer
    // governed-intake transaction (that used to break APS seal with 25P02).
    const sp = "sp_sensitive_field_vault";
    try {
      await client.query(`SAVEPOINT ${sp}`);
      await client.query(
        `INSERT INTO sensitive_field_vault (
           organization_id, case_id, trace_id, event_id, field_path, clear_value
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.organizationId,
          input.caseId,
          input.traceId,
          input.eventId,
          rule.field_path,
          clearValue,
        ],
      );
      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (err) {
      try {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      } catch {
        /* outer txn may already be dead */
      }
      const message = err instanceof Error ? err.message : String(err);
      // Pre-migration 003: skip quietly so ingest still works.
      // Only swallow a missing *relation* — a missing column must surface.
      if (
        /relation ["']?sensitive_field_vault["']? does not exist/i.test(message)
      ) {
        return;
      }
      throw err;
    }
  }
}

export async function readMaskedFieldClear(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    traceId: string;
    fieldPath: string;
  },
): Promise<string | null> {
  const result = await client.query<{ clear_value: string }>(
    `SELECT clear_value FROM sensitive_field_vault
     WHERE organization_id = $1 AND trace_id = $2 AND field_path = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, input.traceId, input.fieldPath],
  );
  return result.rows[0]?.clear_value ?? null;
}
