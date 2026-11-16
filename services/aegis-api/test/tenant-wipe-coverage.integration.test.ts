/**
 * Coverage guard for platform_wipe_tenant() (migration 020).
 *
 * Fails when a table that holds tenant data is not covered by the wipe allowlist
 * (platform_tenant_wipe_tables()). Add the table to the allowlist IN CHILDREN-FIRST ORDER in a new
 * migration (CREATE OR REPLACE FUNCTION platform_tenant_wipe_tables) and re-run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Tables with an organization_id column that are deliberately NOT in the wipe allowlist. */
const ORGANIZATION_ROOT = "organization"; // deleted last by the function itself

/**
 * Tenant-scoped tables WITHOUT an organization_id column, and how the wipe reaches them.
 *  - policy_rule: child of policy; deleted explicitly with policy.
 *  - account-level tables cascade when sole-tenant accounts are deleted.
 */
const INDIRECT_VIA_POLICY = ["policy_rule"];
const INDIRECT_VIA_ACCOUNT = ["password_reset_token", "email_verification_token", "account_oauth"];
/** Global (non-tenant) tables that point at accounts with ON DELETE SET NULL: never wiped. */
const GLOBAL_SET_NULL_ACCOUNT = ["marketing_blog_posts", "research_posts"];
/** Tables that match name patterns but are platform-level / global by design. */
const KNOWN_GLOBAL_TABLES = [
  "plan_catalog", "worker_run", "contact_messages", "marketing_blog_posts", "research_posts",
  "open_roles", "newsletter_subscribers", "newsletter_campaigns", "newsletter_campaign_deliveries",
  "blog_engagement_events", "receipt_signing_key", "schema_migration", "platform_tenant_wipe_audit",
  "account", "account_oauth", "password_reset_token", "email_verification_token",
  "policy_rule", "organization",
];

describeIfDb("tenant wipe coverage", () => {
  beforeAll(async () => {
    await migrateUp();
  });
  afterAll(async () => {
    await closePool();
  });

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await getPool().query(sql, params)).rows as T[];
  }

  it("every table with an organization_id column is in the wipe allowlist (except organization itself)", async () => {
    const allow = (await rows<{ t: string[] }>(`SELECT platform_tenant_wipe_tables() AS t`))[0]!.t;
    const scoped = (
      await rows<{ table_name: string }>(
        `SELECT c.table_name
           FROM information_schema.columns c
           JOIN information_schema.tables t
             ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
            AND t.table_type = 'BASE TABLE'
          ORDER BY c.table_name`,
      )
    ).map((r) => r.table_name);

    const missing = scoped.filter((t) => t !== ORGANIZATION_ROOT && !allow.includes(t));
    expect(
      missing,
      `Tables with organization_id missing from platform_tenant_wipe_tables(): ${missing.join(", ")}`,
    ).toEqual([]);

    // And the allowlist has no stale names or duplicates.
    const stale = allow.filter((t) => !scoped.includes(t));
    expect(stale, `Allowlist names tables without organization_id: ${stale.join(", ")}`).toEqual([]);
    expect(new Set(allow).size).toBe(allow.length);
    expect(allow).not.toContain(ORGANIZATION_ROOT);
  });

  it("known tenant-scoped tables are covered (explicit list)", async () => {
    const allow = (await rows<{ t: string[] }>(`SELECT platform_tenant_wipe_tables() AS t`))[0]!.t;
    const mustWipe = [
      // users / memberships / invites / sessions / keys
      "membership", "organization_invitation", "session", "ingest_api_key", "organization_sso",
      "organization_scim", "organization_scim_group", "organization_scim_group_member",
      // agents / rules / versions
      "agent", "signing_key", "did_document", "policy", "policy_activation_request", "policy_publish_approval",
      "authority_matrix", "field_policy", "bank_role_ladder", "membership_bank_role",
      // cases, receipts, approvals, delegations, access log, reports
      "bank_case", "event", "trace", "span", "forensic_receipt", "forensic_checkpoint",
      "forensic_receipt_seq", "forensic_receipt_timestamp", "receipt_access_log", "receipt_share_token",
      "approval", "approval_vote", "approval_delegate", "approval_channel", "audit_log",
      "compliance_export", "compliance_export_schedule", "incident", "incident_note",
      "auditor_invite", "auditor_access_log",
      // witness / transparency / stored files
      "merkle_root", "inclusion_proof", "transparency_log_entry", "artifact", "signed_event_buffer",
    ];
    for (const t of mustWipe) expect(allow, `${t} must be wiped`).toContain(t);
  });

  it("the allowlist is children-first for every non-cascading foreign key between tenant tables", async () => {
    const allow = (await rows<{ t: string[] }>(`SELECT platform_tenant_wipe_tables() AS t`))[0]!.t;
    const edges = await rows<{ child: string; parent: string }>(
      `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public' AND c.confdeltype IN ('a', 'r')`,
    );
    for (const e of edges) {
      const ci = allow.indexOf(e.child);
      const pi = allow.indexOf(e.parent);
      if (ci === -1 || pi === -1 || e.child === e.parent) continue;
      expect(ci, `${e.child} (child) must be deleted before ${e.parent} (parent)`).toBeLessThan(pi);
    }
  });

  it("tables WITHOUT organization_id that hang off a tenant table are known and handled", async () => {
    const allow = (await rows<{ t: string[] }>(`SELECT platform_tenant_wipe_tables() AS t`))[0]!.t;
    const noOrg = await rows<{ child: string; parent: string }>(
      `SELECT DISTINCT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns ic
             WHERE ic.table_schema = 'public' AND ic.table_name = c.conrelid::regclass::text
               AND ic.column_name = 'organization_id')`,
    );
    for (const e of noOrg) {
      if (allow.includes(e.parent) || e.parent === "organization") {
        // A tenant table is the parent: the child must be a known indirect table.
        expect(
          INDIRECT_VIA_POLICY.includes(e.child) || KNOWN_GLOBAL_TABLES.includes(e.child),
          `${e.child} references tenant table ${e.parent} but is not handled by the wipe`,
        ).toBe(true);
      }
      if (e.parent === "account") {
        expect(
          INDIRECT_VIA_ACCOUNT.includes(e.child) || GLOBAL_SET_NULL_ACCOUNT.includes(e.child),
          `${e.child} references account but is not known (cascade or global SET NULL)`,
        ).toBe(true);
      }
    }
    // policy_rule really is wiped through policy in the function body.
    const src = (
      await rows<{ src: string }>(`SELECT pg_get_functiondef('platform_wipe_tenant(text,boolean,text)'::regprocedure) AS src`)
    )[0]!.src;
    expect(src).toMatch(/DELETE FROM public\.policy_rule/);
    expect(src).toMatch(/SECURITY DEFINER/);
    expect(src).toMatch(/is_demo OR v_org\.is_test/);
  });

  it("no unknown base table carries an organisation reference under another column name", async () => {
    const odd = await rows<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name ILIKE '%org%' AND column_name <> 'organization_id'`,
    );
    // contact_messages.organization is the prospect's company name (free text), and
    // organization_sso.workos_organization_id is an external id on a table the wipe already covers.
    // platform_tenant_wipe_audit.tenant_organization_id is the audit trail itself: no FK, survives the wipe.
    const allowed = new Set([
      "contact_messages.organization",
      "organization_sso.workos_organization_id",
      "platform_tenant_wipe_audit.tenant_organization_id",
    ]);
    const unexpected = odd.filter((o) => !allowed.has(`${o.table_name}.${o.column_name}`));
    expect(unexpected, JSON.stringify(unexpected)).toEqual([]);
  });
});
