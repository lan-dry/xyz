import type pg from "pg";

export type PlanCatalogRow = {
  plan_slug: string;
  display_name: string;
  events_per_month: number | null;
  max_ingest_keys: number;
  max_members: number;
  retention_days: number;
  self_serve: boolean;
  active: boolean;
  stripe_price_id: string | null;
  sort_order: number;
};

export type OrgPlanContext = {
  organization_id: string;
  plan: string;
  active: boolean;
  plan_overrides: Record<string, unknown> | null;
  limits: {
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
  };
};

export class PlanLimitError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 402) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function overrideNumber(
  overrides: Record<string, unknown> | null,
  key: string,
  fallback: number,
): number {
  const v = overrides?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function overrideNullableNumber(
  overrides: Record<string, unknown> | null,
  key: string,
  fallback: number | null,
): number | null {
  const v = overrides?.[key];
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export async function getPlanCatalog(
  client: pg.Pool | pg.PoolClient,
  activeOnly = true,
): Promise<PlanCatalogRow[]> {
  const result = await client.query<PlanCatalogRow>(
    `SELECT plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
            retention_days, self_serve, active, stripe_price_id, sort_order
     FROM plan_catalog
     ${activeOnly ? "WHERE active = true" : ""}
     ORDER BY sort_order, plan_slug`,
  );
  return result.rows;
}

export async function updatePlanCatalogRow(
  client: pg.Pool | pg.PoolClient,
  planSlug: string,
  patch: Partial<{
    display_name: string;
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
    self_serve: boolean;
    active: boolean;
    stripe_price_id: string | null;
  }>,
): Promise<PlanCatalogRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    fields.push(`${key} = $${i++}`);
    values.push(val);
  }
  if (fields.length === 0) {
    const rows = await client.query<PlanCatalogRow>(
      `SELECT plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
              retention_days, self_serve, active, stripe_price_id, sort_order
       FROM plan_catalog WHERE plan_slug = $1`,
      [planSlug],
    );
    return rows.rows[0] ?? null;
  }
  fields.push(`updated_at = now()`);
  values.push(planSlug);
  const result = await client.query<PlanCatalogRow>(
    `UPDATE plan_catalog SET ${fields.join(", ")}
     WHERE plan_slug = $${i}
     RETURNING plan_slug, display_name, events_per_month, max_ingest_keys, max_members,
               retention_days, self_serve, active, stripe_price_id, sort_order`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function getOrgPlanContext(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<OrgPlanContext | null> {
  const result = await client.query<{
    organization_id: string;
    plan: string;
    active: boolean;
    plan_overrides: Record<string, unknown> | null;
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
  }>(
    `SELECT o.organization_id, o.plan, o.active, o.plan_overrides,
            c.events_per_month, c.max_ingest_keys, c.max_members, c.retention_days
     FROM organization o
     JOIN plan_catalog c ON c.plan_slug = o.plan
     WHERE o.organization_id = $1`,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const overrides = row.plan_overrides;
  return {
    organization_id: row.organization_id,
    plan: row.plan,
    active: row.active,
    plan_overrides: overrides,
    limits: {
      events_per_month: overrideNullableNumber(
        overrides,
        "events_per_month",
        row.events_per_month,
      ),
      max_ingest_keys: overrideNumber(overrides, "max_ingest_keys", row.max_ingest_keys),
      max_members: overrideNumber(overrides, "max_members", row.max_members),
      retention_days: overrideNumber(overrides, "retention_days", row.retention_days),
    },
  };
}

export async function getMonthlyEventCount(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<number> {
  const period = monthStart();
  const cached = await client.query<{ event_count: number }>(
    `SELECT event_count FROM organization_usage_monthly
     WHERE organization_id = $1 AND period_month = $2::date`,
    [organizationId, period],
  );
  if (cached.rows[0]) {
    return cached.rows[0].event_count;
  }
  const counted = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM event
     WHERE organization_id = $1
       AND ingested_at >= $2::date
       AND ingested_at < ($2::date + interval '1 month')`,
    [organizationId, period],
  );
  return Number(counted.rows[0]?.count ?? 0);
}

export async function recordNewIngestedEvent(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<void> {
  const period = monthStart();
  await client.query(
    `INSERT INTO organization_usage_monthly (organization_id, period_month, event_count)
     VALUES ($1, $2::date, 1)
     ON CONFLICT (organization_id, period_month)
     DO UPDATE SET event_count = organization_usage_monthly.event_count + 1,
                   updated_at = now()`,
    [organizationId, period],
  );
}

/** Reconcile organization_usage_monthly from ingested events (B-125). */
export async function backfillOrganizationUsageMonthly(
  client: pg.Pool | pg.PoolClient,
  options?: { organizationId?: string; periodMonth?: string },
): Promise<{ organizations_updated: number }> {
  const period = options?.periodMonth ?? monthStart();
  const params: string[] = [period];
  let orgFilter = "";
  if (options?.organizationId) {
    params.push(options.organizationId);
    orgFilter = `AND e.organization_id = $2`;
  }
  const result = await client.query(
    `INSERT INTO organization_usage_monthly (organization_id, period_month, event_count)
     SELECT e.organization_id, $1::date, COUNT(*)::int
     FROM event e
     WHERE e.ingested_at >= $1::date
       AND e.ingested_at < ($1::date + interval '1 month')
       ${orgFilter}
     GROUP BY e.organization_id
     ON CONFLICT (organization_id, period_month)
     DO UPDATE SET event_count = EXCLUDED.event_count, updated_at = now()
     RETURNING organization_id`,
    params,
  );
  return { organizations_updated: result.rowCount ?? 0 };
}

export async function assertOrgActiveForIngest(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<OrgPlanContext> {
  const ctx = await getOrgPlanContext(client, organizationId);
  if (!ctx) {
    throw new PlanLimitError("org_not_found", "Organization not found", 404);
  }
  if (!ctx.active) {
    throw new PlanLimitError(
      "org_suspended",
      "Organization is suspended",
      403,
    );
  }
  return ctx;
}

export async function assertIngestWithinLimits(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<OrgPlanContext> {
  const ctx = await assertOrgActiveForIngest(client, organizationId);
  const cap = ctx.limits.events_per_month;
  if (cap == null) return ctx;
  const used = await getMonthlyEventCount(client, organizationId);
  if (used >= cap) {
    throw new PlanLimitError(
      "events_limit",
      `Monthly event limit reached (${used}/${cap}). Upgrade plan or contact Salanor.`,
      402,
    );
  }
  return ctx;
}

export async function assertCanCreateIngestKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<void> {
  const ctx = await getOrgPlanContext(client, organizationId);
  if (!ctx?.active) {
    throw new PlanLimitError("org_suspended", "Organization is suspended", 403);
  }
  const max = ctx.limits.max_ingest_keys;
  const count = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ingest_api_key
     WHERE organization_id = $1 AND active = true`,
    [organizationId],
  );
  const n = Number(count.rows[0]?.count ?? 0);
  if (n >= max) {
    throw new PlanLimitError(
      "ingest_keys_limit",
      `API key limit reached (${n}/${max})`,
      402,
    );
  }
}

export async function assertCanAddMember(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<void> {
  const ctx = await getOrgPlanContext(client, organizationId);
  if (!ctx?.active) {
    throw new PlanLimitError("org_suspended", "Organization is suspended", 403);
  }
  const max = ctx.limits.max_members;
  const count = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM membership
     WHERE organization_id = $1 AND status = 'active'`,
    [organizationId],
  );
  const n = Number(count.rows[0]?.count ?? 0);
  if (n >= max) {
    throw new PlanLimitError(
      "members_limit",
      `Member limit reached (${n}/${max})`,
      402,
    );
  }
}

export async function getOrgPlanUsageSummary(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{
  plan: string;
  display_name: string;
  active: boolean;
  usage: { events_this_month: number };
  limits: OrgPlanContext["limits"];
  self_serve: boolean;
  billing_checkout_enabled: boolean;
  billing_portal_available: boolean;
} | null> {
  const ctx = await getOrgPlanContext(client, organizationId);
  if (!ctx) return null;
  const catalog = await client.query<{ display_name: string; self_serve: boolean }>(
    `SELECT display_name, self_serve FROM plan_catalog WHERE plan_slug = $1`,
    [ctx.plan],
  );
  const stripeRow = await client.query<{ stripe_customer_id: string | null }>(
    `SELECT stripe_customer_id FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  const events = await getMonthlyEventCount(client, organizationId);
  const checkoutEnabled =
    process.env.BILLING_CHECKOUT_ENABLED === "1" ||
    process.env.BILLING_CHECKOUT_ENABLED === "true";
  const stripeCustomerId = stripeRow.rows[0]?.stripe_customer_id?.trim() || null;
  return {
    plan: ctx.plan,
    display_name: catalog.rows[0]?.display_name ?? ctx.plan,
    active: ctx.active,
    usage: { events_this_month: events },
    limits: ctx.limits,
    self_serve: catalog.rows[0]?.self_serve ?? false,
    billing_checkout_enabled: checkoutEnabled,
    billing_portal_available: checkoutEnabled && Boolean(stripeCustomerId),
  };
}

export async function deleteSessionsForAccount(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<void> {
  await client.query(`DELETE FROM session WHERE account_id = $1`, [accountId]);
}

export async function deleteSessionsForMembership(
  client: pg.Pool | pg.PoolClient,
  membershipId: string,
): Promise<void> {
  await client.query(`DELETE FROM session WHERE membership_id = $1`, [membershipId]);
}

export async function platformListOrganizations(
  client: pg.Pool | pg.PoolClient,
  query?: string,
): Promise<
  Array<{
    organization_id: string;
    name: string;
    slug: string;
    plan: string;
    active: boolean;
    created_at: Date;
    member_count: number;
    events_this_month: number;
  }>
> {
  const period = monthStart();
  const q = query?.trim().toLowerCase();
  const result = await client.query<{
    organization_id: string;
    name: string;
    slug: string;
    plan: string;
    active: boolean;
    created_at: Date;
    member_count: string;
    events_this_month: string;
  }>(
    `SELECT o.organization_id, o.name, o.slug, o.plan, o.active, o.created_at,
            (SELECT COUNT(*)::text FROM membership m
             WHERE m.organization_id = o.organization_id AND m.status = 'active') AS member_count,
            COALESCE(u.event_count::text, '0') AS events_this_month
     FROM organization o
     LEFT JOIN organization_usage_monthly u
       ON u.organization_id = o.organization_id AND u.period_month = $1::date
     WHERE ($2::text IS NULL OR lower(o.name) LIKE '%' || $2 || '%'
            OR lower(o.slug) LIKE '%' || $2 || '%')
     ORDER BY o.created_at DESC
     LIMIT 200`,
    [period, q || null],
  );
  return result.rows.map((r) => ({
    organization_id: r.organization_id,
    name: r.name,
    slug: r.slug,
    plan: r.plan,
    active: r.active,
    created_at: r.created_at,
    member_count: Number(r.member_count),
    events_this_month: Number(r.events_this_month),
  }));
}

export async function platformUpdateOrganization(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  patch: {
    plan?: string;
    active?: boolean;
    plan_overrides?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.plan !== undefined) {
    fields.push(`plan = $${i++}`);
    values.push(patch.plan);
  }
  if (patch.active !== undefined) {
    fields.push(`active = $${i++}`);
    values.push(patch.active);
  }
  if (patch.plan_overrides !== undefined) {
    fields.push(`plan_overrides = $${i++}`);
    values.push(patch.plan_overrides ? JSON.stringify(patch.plan_overrides) : null);
  }
  if (fields.length === 0) return false;
  fields.push(`updated_at = now()`);
  values.push(organizationId);
  const result = await client.query(
    `UPDATE organization SET ${fields.join(", ")} WHERE organization_id = $${i}`,
    values,
  );
  return (result.rowCount ?? 0) > 0;
}

export type PlatformAccountMembership = {
  membership_id: string;
  organization_id: string;
  org_name: string;
  org_slug: string;
  role: string;
  status: string;
};

export type PlatformAccountRow = {
  account_id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  platform_role: string | null;
  created_at: Date;
  updated_at: Date;
  memberships: PlatformAccountMembership[];
};

async function loadMembershipsForAccounts(
  client: pg.Pool | pg.PoolClient,
  accountIds: string[],
): Promise<Map<string, PlatformAccountMembership[]>> {
  const map = new Map<string, PlatformAccountMembership[]>();
  if (accountIds.length === 0) return map;
  const mems = await client.query<PlatformAccountMembership & { account_id: string }>(
    `SELECT m.account_id, m.membership_id, m.organization_id, o.name AS org_name, o.slug AS org_slug,
            m.role, m.status
     FROM membership m
     JOIN organization o ON o.organization_id = m.organization_id
     WHERE m.account_id = ANY($1::uuid[])
     ORDER BY o.name`,
    [accountIds],
  );
  for (const row of mems.rows) {
    const list = map.get(row.account_id) ?? [];
    list.push({
      membership_id: row.membership_id,
      organization_id: row.organization_id,
      org_name: row.org_name,
      org_slug: row.org_slug,
      role: row.role,
      status: row.status,
    });
    map.set(row.account_id, list);
  }
  return map;
}

export async function platformListAccountsPaginated(
  client: pg.Pool | pg.PoolClient,
  opts: { query?: string; limit?: number; offset?: number },
): Promise<{ accounts: PlatformAccountRow[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.query?.trim().toLowerCase() || null;

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM account
     WHERE ($1::text IS NULL OR lower(email) LIKE '%' || $1 || '%')`,
    [q],
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const accounts = await client.query<{
    account_id: string;
    email: string;
    display_name: string | null;
    active: boolean;
    platform_role: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT account_id, email, display_name, active, platform_role, created_at, updated_at
     FROM account
     WHERE ($1::text IS NULL OR lower(email) LIKE '%' || $1 || '%')
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );

  const memMap = await loadMembershipsForAccounts(
    client,
    accounts.rows.map((a) => a.account_id),
  );

  return {
    accounts: accounts.rows.map((a) => ({
      ...a,
      memberships: memMap.get(a.account_id) ?? [],
    })),
    total,
    limit,
    offset,
  };
}

export async function platformGetAccount(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<PlatformAccountRow | null> {
  const accounts = await client.query<{
    account_id: string;
    email: string;
    display_name: string | null;
    active: boolean;
    platform_role: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT account_id, email, display_name, active, platform_role, created_at, updated_at
     FROM account WHERE account_id = $1`,
    [accountId],
  );
  const acct = accounts.rows[0];
  if (!acct) return null;
  const memMap = await loadMembershipsForAccounts(client, [accountId]);
  return { ...acct, memberships: memMap.get(accountId) ?? [] };
}

export async function platformOverviewStats(client: pg.Pool | pg.PoolClient): Promise<{
  organizations_total: number;
  organizations_active: number;
  accounts_total: number;
  accounts_active: number;
  events_this_month: number;
}> {
  const period = monthStart();
  const result = await client.query<{
    organizations_total: string;
    organizations_active: string;
    accounts_total: string;
    accounts_active: string;
    events_this_month: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM organization) AS organizations_total,
       (SELECT COUNT(*)::text FROM organization WHERE active) AS organizations_active,
       (SELECT COUNT(*)::text FROM account) AS accounts_total,
       (SELECT COUNT(*)::text FROM account WHERE active) AS accounts_active,
       (SELECT COALESCE(SUM(event_count), 0)::text FROM organization_usage_monthly
        WHERE period_month = $1::date) AS events_this_month`,
    [period],
  );
  const row = result.rows[0];
  return {
    organizations_total: Number(row?.organizations_total ?? 0),
    organizations_active: Number(row?.organizations_active ?? 0),
    accounts_total: Number(row?.accounts_total ?? 0),
    accounts_active: Number(row?.accounts_active ?? 0),
    events_this_month: Number(row?.events_this_month ?? 0),
  };
}

export async function platformListAuditLogs(
  client: pg.Pool | pg.PoolClient,
  opts: { limit?: number; offset?: number },
): Promise<{
  logs: Array<{
    audit_id: string;
    organization_id: string;
    org_name: string;
    org_slug: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
    actor_email: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_log`,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);
  const result = await client.query<{
    audit_id: string;
    organization_id: string;
    org_name: string;
    org_slug: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
    actor_email: string | null;
  }>(
    `SELECT a.audit_id, a.organization_id, o.name AS org_name, o.slug AS org_slug,
            a.action, a.resource_type, a.resource_id, a.metadata, a.created_at,
            COALESCE(ac.email, a.metadata->>'actor_email') AS actor_email
     FROM audit_log a
     JOIN organization o ON o.organization_id = a.organization_id
     LEFT JOIN membership m ON m.membership_id = a.user_id
     LEFT JOIN account ac ON ac.account_id = m.account_id
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return { logs: result.rows, total, limit, offset };
}

export async function platformListAccounts(
  client: pg.Pool | pg.PoolClient,
  query?: string,
): Promise<
  Array<{
    account_id: string;
    email: string;
    display_name: string | null;
    active: boolean;
    created_at: Date;
    memberships: Array<{
      membership_id: string;
      organization_id: string;
      org_name: string;
      org_slug: string;
      role: string;
      status: string;
    }>;
  }>
> {
  const q = query?.trim().toLowerCase();
  const accounts = await client.query<{
    account_id: string;
    email: string;
    display_name: string | null;
    active: boolean;
    created_at: Date;
  }>(
    `SELECT account_id, email, display_name, active, created_at
     FROM account
     WHERE ($1::text IS NULL OR lower(email) LIKE '%' || $1 || '%')
     ORDER BY created_at DESC
     LIMIT 100`,
    [q || null],
  );

  const out: Array<{
    account_id: string;
    email: string;
    display_name: string | null;
    active: boolean;
    created_at: Date;
    memberships: Array<{
      membership_id: string;
      organization_id: string;
      org_name: string;
      org_slug: string;
      role: string;
      status: string;
    }>;
  }> = [];

  const memMap = await loadMembershipsForAccounts(
    client,
    accounts.rows.map((a) => a.account_id),
  );
  for (const acct of accounts.rows) {
    out.push({ ...acct, memberships: memMap.get(acct.account_id) ?? [] });
  }
  return out;
}

export async function platformSetAccountActive(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  active: boolean,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE account SET active = $2, updated_at = now() WHERE account_id = $1`,
    [accountId, active],
  );
  if (!active) {
    await deleteSessionsForAccount(client, accountId);
  }
  return (result.rowCount ?? 0) > 0;
}

export async function platformSetMembershipStatus(
  client: pg.Pool | pg.PoolClient,
  membershipId: string,
  status: "active" | "suspended",
): Promise<boolean> {
  const result = await client.query(
    `UPDATE membership SET status = $2 WHERE membership_id = $1`,
    [membershipId, status],
  );
  if (status === "suspended") {
    await deleteSessionsForMembership(client, membershipId);
  }
  return (result.rowCount ?? 0) > 0;
}

export async function platformResetAccountPassword(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  passwordHash: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE account SET password_hash = $2, updated_at = now() WHERE account_id = $1`,
    [accountId, passwordHash],
  );
  await deleteSessionsForAccount(client, accountId);
  return (result.rowCount ?? 0) > 0;
}
