/**
 * Platform Ops — demo / test tenant list, assert, audit, wipe helpers.
 * Wipe execution still requires the schema OWNER connection (MIGRATION_DATABASE_URL).
 */
import type pg from "pg";

export type DemoTenantRow = {
  organization_id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  is_demo: boolean;
  is_test: boolean;
  created_at: Date;
  last_demo_reset_at: Date | null;
  member_count: number;
  status: "active" | "suspended";
};

export type DemoTenantAuditRow = {
  wipe_id: string;
  wiped_at: Date;
  tenant_slug: string;
  tenant_name: string | null;
  tenant_organization_id: string;
  actor: string;
  action: string;
  result: Record<string, unknown>;
  tenant_flags: Record<string, unknown>;
};

export class DemoTenantRefusal extends Error {
  constructor(
    readonly code:
      | "confirm_mismatch"
      | "not_wipeable"
      | "not_found"
      | "slug_required"
      | "forbidden_slug",
    message: string,
  ) {
    super(message);
    this.name = "DemoTenantRefusal";
  }
}

export function requireConfirmSlug(slug: string, confirm: string | undefined): void {
  const s = slug.trim();
  if (!s) throw new DemoTenantRefusal("slug_required", "slug is required");
  if ((confirm ?? "").trim() !== s) {
    throw new DemoTenantRefusal(
      "confirm_mismatch",
      `confirm_slug must exactly match "${s}"`,
    );
  }
}

export async function platformListDemoTenants(
  client: pg.Pool | pg.PoolClient,
): Promise<DemoTenantRow[]> {
  const result = await client.query<{
    organization_id: string;
    name: string;
    slug: string;
    plan: string;
    active: boolean;
    is_demo: boolean;
    is_test: boolean;
    created_at: Date;
    last_demo_reset_at: Date | null;
    member_count: string;
  }>(
    `SELECT o.organization_id, o.name, o.slug, o.plan, o.active,
            o.is_demo, o.is_test, o.created_at,
            o.last_demo_reset_at,
            (SELECT COUNT(*)::text FROM membership m
              WHERE m.organization_id = o.organization_id AND m.status = 'active'
            ) AS member_count
     FROM organization o
     WHERE o.is_demo = true OR o.is_test = true
     ORDER BY o.slug ASC`,
  );
  return result.rows.map((r) => ({
    organization_id: r.organization_id,
    name: r.name,
    slug: r.slug,
    plan: r.plan,
    active: r.active,
    is_demo: r.is_demo === true,
    is_test: r.is_test === true,
    created_at: r.created_at,
    last_demo_reset_at: r.last_demo_reset_at,
    member_count: Number(r.member_count),
    status: r.active ? "active" : "suspended",
  }));
}

export async function platformListDemoTenantAudit(
  client: pg.Pool | pg.PoolClient,
  limit = 50,
): Promise<DemoTenantAuditRow[]> {
  const result = await client.query<{
    wipe_id: string;
    wiped_at: Date;
    tenant_slug: string;
    tenant_name: string | null;
    tenant_organization_id: string;
    actor: string;
    action: string;
    result: Record<string, unknown>;
    tenant_flags: Record<string, unknown>;
  }>(
    `SELECT wipe_id, wiped_at, tenant_slug, tenant_name, tenant_organization_id,
            actor, COALESCE(action, 'wipe') AS action,
            COALESCE(result, '{}'::jsonb) AS result,
            tenant_flags
     FROM platform_tenant_wipe_audit
     ORDER BY wiped_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return result.rows;
}

/** DB-enforced: raises if slug is not is_demo/is_test. */
export async function platformAssertDemoOrTest(
  client: pg.Pool | pg.PoolClient,
  slug: string,
): Promise<{ organization_id: string; slug: string; is_demo: boolean; is_test: boolean }> {
  try {
    const result = await client.query<{
      organization_id: string;
      slug: string;
      is_demo: boolean;
      is_test: boolean;
    }>(
      `SELECT organization_id, slug, is_demo, is_test
       FROM platform_assert_demo_or_test($1)`,
      [slug.trim()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new DemoTenantRefusal("not_found", `No organisation with slug ${slug}`);
    }
    return row;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/tenant_wipe_refused|neither is_demo nor is_test/i.test(msg)) {
      throw new DemoTenantRefusal("not_wipeable", msg);
    }
    if (/no organisation|no_data_found/i.test(msg)) {
      throw new DemoTenantRefusal("not_found", msg);
    }
    throw err;
  }
}

export async function platformRecordDemoTenantAction(
  client: pg.Pool | pg.PoolClient,
  input: {
    slug: string;
    action: "wipe" | "create" | "load_history" | "reset" | "refuse";
    actor: string;
    result?: Record<string, unknown>;
    requireDemoOrTest?: boolean;
  },
): Promise<Record<string, unknown>> {
  try {
    const result = await client.query<{ platform_record_demo_tenant_action: Record<string, unknown> }>(
      `SELECT platform_record_demo_tenant_action($1, $2, $3, $4::jsonb, $5) AS platform_record_demo_tenant_action`,
      [
        input.slug.trim(),
        input.action,
        input.actor,
        JSON.stringify(input.result ?? {}),
        input.requireDemoOrTest !== false,
      ],
    );
    const row = result.rows[0]?.platform_record_demo_tenant_action ?? {};
    if (row.refused === true || row.ok === false) {
      throw new DemoTenantRefusal(
        "not_wipeable",
        String(row.message ?? `tenant_wipe_refused: ${input.slug}`),
      );
    }
    return row;
  } catch (err) {
    if (err instanceof DemoTenantRefusal) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/tenant_wipe_refused|neither is_demo nor is_test/i.test(msg)) {
      throw new DemoTenantRefusal("not_wipeable", msg);
    }
    if (/no organisation|no_data_found/i.test(msg)) {
      throw new DemoTenantRefusal("not_found", msg);
    }
    throw err;
  }
}
