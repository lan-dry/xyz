/**
 * Re-applying a pack must not silently overwrite customer edits unless force=true.
 * Pack id + version are recorded on the tenant.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { applyDemoPack } from "../src/packs/apply-pack.js";
import { loadDemoPack } from "../src/packs/load.js";

const url = process.env.DATABASE_URL?.trim();
const describeDb = url ? describe : describe.skip;

describeDb("pack apply: version record + no silent overwrite", () => {
  let pool: pg.Pool;
  let orgId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    orgId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO organization (organization_id, name, slug, plan, active, is_test)
         VALUES ($1, 'Insurance Pack Test', $2, 'free', true, true)`,
        [orgId, `ins-pack-${orgId.slice(0, 8)}`],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Best-effort cleanup of test tenant rows (is_test org).
      await client.query(`DELETE FROM policy_rule WHERE policy_id IN (SELECT policy_id FROM policy WHERE organization_id = $1)`, [orgId]);
      await client.query(`DELETE FROM policy WHERE organization_id = $1`, [orgId]);
      await client.query(`DELETE FROM field_policy WHERE organization_id = $1`, [orgId]);
      await client.query(`DELETE FROM authority_matrix WHERE organization_id = $1`, [orgId]);
      await client.query(`DELETE FROM bank_role_ladder WHERE organization_id = $1`, [orgId]);
      await client.query(`DELETE FROM governed_workflow WHERE organization_id = $1`, [orgId]);
      await client.query(`DELETE FROM organization WHERE organization_id = $1`, [orgId]);
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("applies illustrative insurance pack and records pack id/version", async () => {
    const pack = loadDemoPack("insurance");
    expect(pack.currencies[0]).toBe("EUR");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const applied = await applyDemoPack(client, orgId, "insurance");
      await client.query("COMMIT");
      expect(applied.packId).toBe(pack.id);
      expect(applied.packVersion).toBe(pack.version);
      expect(applied.overwritten).toBe(false);

      const row = await pool.query<{ gs: { applied_pack?: { id: string; version: number } } }>(
        `SELECT governance_settings AS gs FROM organization WHERE organization_id = $1`,
        [orgId],
      );
      expect(row.rows[0]?.gs?.applied_pack?.id).toBe(pack.id);
      expect(row.rows[0]?.gs?.applied_pack?.version).toBe(pack.version);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });

  it("re-apply without force keeps customer-edited role display_name", async () => {
    await pool.query(
      `UPDATE bank_role_ladder SET display_name = 'Customer Renamed Handler'
       WHERE organization_id = $1 AND role_key = 'claims_handler'`,
      [orgId],
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyDemoPack(client, orgId, "insurance", { force: false });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    const r = await pool.query<{ display_name: string }>(
      `SELECT display_name FROM bank_role_ladder
       WHERE organization_id = $1 AND role_key = 'claims_handler'`,
      [orgId],
    );
    expect(r.rows[0]?.display_name).toBe("Customer Renamed Handler");
  });

  it("re-apply with force overwrites role display_name", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyDemoPack(client, orgId, "insurance", { force: true });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    const r = await pool.query<{ display_name: string }>(
      `SELECT display_name FROM bank_role_ladder
       WHERE organization_id = $1 AND role_key = 'claims_handler'`,
      [orgId],
    );
    expect(r.rows[0]?.display_name).toBe("Claims Handler");
  });
});
