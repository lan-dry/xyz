/**
 * DB-enforced refusal: platform_assert_demo_or_test / record action on non-demo org.
 * Skips when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url =
  process.env.MIGRATION_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

describe.skipIf(!url)("demo tenant Ops DB refusal", () => {
  const pool = new pg.Pool({ connectionString: url });
  const customerSlug = `cust-refusal-${Date.now().toString(36)}`;
  let orgId: string | null = null;
  let ready = false;

  beforeAll(async () => {
    const fn = await pool.query(
      `SELECT 1 FROM pg_proc WHERE proname = 'platform_assert_demo_or_test'`,
    );
    if (!fn.rows[0]) {
      console.warn("skip: platform_assert_demo_or_test missing (run db:migrate)");
      return;
    }
    const plan = await pool.query(
      `SELECT plan_slug FROM plan_catalog WHERE active LIMIT 1`,
    ).catch(() => ({ rows: [] as Array<{ plan_slug: string }> }));
    const planSlug = plan.rows[0]?.plan_slug ?? "free";
    try {
      const ins = await pool.query<{ organization_id: string }>(
        `INSERT INTO organization (name, slug, plan, is_demo, is_test)
         VALUES ($1, $2, $3, false, false)
         RETURNING organization_id`,
        ["Customer Refusal Org", customerSlug, planSlug],
      );
      orgId = ins.rows[0]?.organization_id ?? null;
      ready = Boolean(orgId);
    } catch (err) {
      console.warn("skip setup:", err instanceof Error ? err.message : err);
    }
  });

  afterAll(async () => {
    if (orgId) {
      await pool.query(`DELETE FROM organization WHERE organization_id = $1`, [orgId]);
    }
    await pool.end();
  });

  it("platform_assert_demo_or_test refuses customer tenant", async () => {
    if (!ready) return;
    await expect(
      pool.query(`SELECT * FROM platform_assert_demo_or_test($1)`, [customerSlug]),
    ).rejects.toThrow(/tenant_wipe_refused|neither is_demo nor is_test/i);
  });

  it("platform_record_demo_tenant_action refuses and audits", async () => {
    if (!ready) return;
    const res = await pool.query<{
      platform_record_demo_tenant_action: { refused?: boolean; ok?: boolean };
    }>(
      `SELECT platform_record_demo_tenant_action($1, 'wipe', 'test:ops', '{}'::jsonb, true) AS platform_record_demo_tenant_action`,
      [customerSlug],
    );
    const body = res.rows[0]?.platform_record_demo_tenant_action;
    expect(body?.refused === true || body?.ok === false).toBe(true);

    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM platform_tenant_wipe_audit
       WHERE tenant_slug = $1 AND action = 'refuse'
       ORDER BY wiped_at DESC LIMIT 1`,
      [customerSlug],
    );
    expect(audit.rows[0]?.action).toBe("refuse");
  });
});
