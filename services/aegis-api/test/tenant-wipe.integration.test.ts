/**
 * Tenant wipe (migration 020, pnpm pilot:wipe-tenant, pnpm demo:fresh).
 *
 * Runs against the throwaway aegis_test database (see setup-env.ts), as the schema owner
 * (the test DB user is the owner/superuser, exactly like MIGRATION_DATABASE_URL in production).
 * The app role is emulated with a NOLOGIN role that is granted DML on every table (the worst case of
 * the prod-like grant script) to prove it still cannot delete sealed rows or call the wipe function.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";
import { signEvent, type ApsEvent } from "@salanor/aegis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { persistSignedEvent } from "../src/ingest/persist.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import { loadEvidenceBundle, verifyBundleFile } from "../src/forensic/evidence-bundle.js";
import { buildPublicVerificationBundle } from "../src/transparency/bundle.js";
import { publishTransparencyLogForOrg } from "../src/transparency/publish.js";
import { runWitnessBatchForOrg } from "../../aegis-signer/src/batch-lib.js";
import { verifyPublicBundle } from "../../../tools/verifier/verify-lib.js";
import { platformSetStableIngestKey } from "../../../packages/platform-auth/src/demo-ingest-key.js";
import { hashIngestKey } from "../src/repo/ingest-keys.js";
import {
  WipeRefusal,
  callWipeFunction,
  decideWipeMode,
} from "../../../tools/demo/tenant-wipe-lib.mts";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const TSX_CLI = resolve(repoRoot, "tools/demo/node_modules/tsx/dist/cli.mjs");
const WIPE_CLI = resolve(repoRoot, "tools/demo/wipe-tenant.mts");
const TEST_ACTOR = "vitest-tenant-wipe";
const APP_ROLE = "wipe_test_app_role";

const run = randomUUID().replace(/-/g, "").slice(0, 8);
const SLUG_TEST = `wipe-a-${run}`; // is_test: wipeable
const SLUG_DEMO = `wipe-demo-${run}`; // is_demo: wipeable
const SLUG_OTHER = `wipe-keep-${run}`; // customer tenant: never wipeable
const SLUG_SMOKE_UNFLAGGED = `wipe-smoke-unflagged-${run}`; // slug says smoke, flags say customer

type Tenant = {
  slug: string;
  orgId: string;
  agentId: string;
  keyId: string;
  traceId: string;
  eventIds: string[];
  adminAccountId: string;
  sharedAccountId?: string;
};

async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await getPool().query<T>(sql, params)).rows;
}

async function tenantTables(): Promise<string[]> {
  const rows = await q<{ t: string[] }>(`SELECT platform_tenant_wipe_tables() AS t`);
  return rows[0]!.t;
}

/** Row count per tenant table (+ policy_rule via policy) for one organisation. */
async function snapshot(orgId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await tenantTables()) {
    const r = await q<{ n: string }>(`SELECT count(*)::text AS n FROM ${t} WHERE organization_id = $1`, [orgId]);
    out[t] = Number(r[0]!.n);
  }
  const pr = await q<{ n: string }>(
    `SELECT count(*)::text AS n FROM policy_rule WHERE policy_id IN (SELECT policy_id FROM policy WHERE organization_id = $1)`,
    [orgId],
  );
  out.policy_rule = Number(pr[0]!.n);
  out.organization = Number(
    (await q<{ n: string }>(`SELECT count(*)::text AS n FROM organization WHERE organization_id = $1`, [orgId]))[0]!.n,
  );
  return out;
}

async function newOrg(slug: string, flags: { is_demo?: boolean; is_test?: boolean }): Promise<string> {
  const r = await q<{ organization_id: string }>(
    `INSERT INTO organization (name, slug, is_demo, is_test, onboarding_completed_at)
     VALUES ($1, $2, $3, $4, now()) RETURNING organization_id`,
    [`Wipe test ${slug}`, slug, flags.is_demo ?? false, flags.is_test ?? false],
  );
  return r[0]!.organization_id;
}

/**
 * Seed one tenant through the REAL write paths where they exist (signed events, witness batch,
 * transparency log, forensic receipt) and direct inserts for the rest, so many tables hold rows.
 */
async function seedTenant(
  slug: string,
  flags: { is_demo?: boolean; is_test?: boolean },
  opts: { sharedAccountWith?: string } = {},
): Promise<Tenant> {
  const pool = getPool();
  const orgId = await newOrg(slug, flags);
  const agentId = `agent-${slug}`;
  const keyId = `key-${slug}`;
  const traceId = `trc_${slug}`;

  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKeyAsync(priv);
  const privB64 = Buffer.from(priv).toString("base64");

  await q(`INSERT INTO agent (agent_id, organization_id, did, slug) VALUES ($1,$2,$3,$4)`, [
    agentId, orgId, `did:salanor:test:${agentId}`, "agent",
  ]);
  await q(
    `INSERT INTO signing_key (key_id, agent_id, organization_id, kms_provider, public_key_b64, valid_from)
     VALUES ($1,$2,$3,'dev',$4, now() - interval '1 minute')`,
    [keyId, agentId, orgId, Buffer.from(pub).toString("base64")],
  );
  await q(`INSERT INTO did_document (agent_id, organization_id, document_json) VALUES ($1,$2,'{}'::jsonb)`, [agentId, orgId]);

  // Identity: admin account, a plain member, plus (optionally) an account shared with another tenant.
  const adminEmail = `admin-${slug}@wipe.test`;
  const admin = await q<{ account_id: string }>(
    `INSERT INTO account (email, display_name, password_hash) VALUES ($1,'Admin','x') RETURNING account_id`,
    [adminEmail],
  );
  const adminAccountId = admin[0]!.account_id;
  const mem = await q<{ membership_id: string }>(
    `INSERT INTO membership (account_id, organization_id, role) VALUES ($1,$2,'admin') RETURNING membership_id`,
    [adminAccountId, orgId],
  );
  const membershipId = mem[0]!.membership_id;
  const member = await q<{ account_id: string }>(
    `INSERT INTO account (email, display_name, password_hash) VALUES ($1,'Member','x') RETURNING account_id`,
    [`member-${slug}@wipe.test`],
  );
  await q(`INSERT INTO membership (account_id, organization_id, role) VALUES ($1,$2,'viewer')`, [
    member[0]!.account_id, orgId,
  ]);
  let sharedAccountId: string | undefined;
  if (opts.sharedAccountWith) {
    const shared = await q<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = lower($1)`,
      [opts.sharedAccountWith],
    );
    sharedAccountId = shared[0]!.account_id;
    await q(`INSERT INTO membership (account_id, organization_id, role) VALUES ($1,$2,'engineer')`, [
      sharedAccountId, orgId,
    ]);
  }
  await q(
    `INSERT INTO session (membership_id, account_id, organization_id, token_hash, expires_at)
     VALUES ($1,$2,$3,$4, now() + interval '1 day')`,
    [membershipId, adminAccountId, orgId, randomBytes(16).toString("hex")],
  );
  await q(
    `INSERT INTO organization_invitation (organization_id, email, token_hash, expires_at)
     VALUES ($1,$2,$3, now() + interval '1 day')`,
    [orgId, `invitee-${slug}@wipe.test`, randomBytes(16).toString("hex")],
  );
  await q(
    `INSERT INTO ingest_api_key (organization_id, name, key_prefix, key_hash) VALUES ($1,'k','aegis_xx',$2)`,
    [orgId, randomBytes(16).toString("hex")],
  );
  await q(
    `INSERT INTO policy (policy_id, organization_id, name, version) VALUES ($1,$2,'p',1)`,
    [`pol_${slug}`, orgId],
  );
  await q(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision) VALUES ($1,$2,'*','allow')`,
    [`rule_${slug}`, `pol_${slug}`],
  );
  await q(`INSERT INTO approval_channel (channel_id, organization_id, channel_type) VALUES ($1,$2,'web_ui')`, [
    `chn_${slug}`, orgId,
  ]);
  await q(`INSERT INTO webhook_endpoint (organization_id, url, secret_hash) VALUES ($1,'https://x.test/h','h')`, [orgId]);
  await q(`INSERT INTO audit_log (organization_id, user_id, action, resource_type) VALUES ($1,$2,'test.seed','org')`, [
    orgId, membershipId,
  ]);
  await q(
    `INSERT INTO compliance_export (export_id, organization_id, bundle_type, period_start, period_end)
     VALUES ($1,$2,'combined', now() - interval '1 day', now())`,
    [`exp_${slug}`, orgId],
  );
  await q(
    `INSERT INTO organization_usage_monthly (organization_id, period_month, event_count) VALUES ($1, date_trunc('month', now())::date, 3)`,
    [orgId],
  );

  // Sealed events (real signatures + hash chain), then witness + transparency.
  const eventIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const event: ApsEvent = {
      schema_version: 1,
      event_id: `evt_${slug}_${i}`,
      organization_id: orgId,
      trace_id: traceId,
      agent_id: agentId,
      key_id: keyId,
      emitted_at: new Date(Date.now() - (3 - i) * 1000).toISOString(),
      actor_type: "agent",
      actor_principal: "tenant-wipe-test",
      action_kind: "tool_call",
      policy_decision: "allow",
      tool_name: "test.wipe",
      payload: { case_id: `case-${slug}`, i },
    };
    const signed = await signEvent(event, { privateKeyB64: privB64, keyId });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await persistSignedEvent(client, signed, `idem-${slug}-${i}`);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    eventIds.push(signed.event_id);
  }
  await q(
    `INSERT INTO approval (approval_id, event_id, organization_id, channel_type) VALUES ($1,$2,$3,'web_ui')`,
    [`apr_${slug}`, eventIds[0], orgId],
  );
  await runWitnessBatchForOrg(pool, orgId);
  await publishTransparencyLogForOrg(pool, orgId);

  const evs = await q<{ event_id: string; event_hash: string; sequence_num: string }>(
    `SELECT event_id, event_hash, sequence_num::text FROM event WHERE organization_id = $1 ORDER BY sequence_num`,
    [orgId],
  );
  for (const [i, e] of evs.entries()) {
    const receipt = await issueForensicReceipt(pool, {
      organization_id: orgId,
      case_id: `case-${slug}`,
      decision_id: `dec-${slug}-${i}`,
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: e.event_id, event_hash: e.event_hash, sequence_num: Number(e.sequence_num) },
      ],
      signingKey: { key_id: `rcpt-${slug}`, private_key_b64: privB64 },
    });
    await q(
      `INSERT INTO receipt_access_log (organization_id, receipt_id, actor_membership_id, actor_email) VALUES ($1,$2,$3,'a@wipe.test')`,
      [orgId, receipt.receipt_id, membershipId],
    );
  }
  return { slug, orgId, agentId, keyId, traceId, eventIds, adminAccountId, sharedAccountId };
}

function runCli(
  args: string[],
  env: Record<string, string | undefined>,
): { status: number | null; out: string } {
  const res = spawnSync(process.execPath, [TSX_CLI, WIPE_CLI, ...args], {
    cwd: resolve(repoRoot, "tools/demo"),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      MIGRATION_DATABASE_URL: databaseUrl,
      AEGIS_WIPE_ACTOR: TEST_ACTOR,
      ...env,
    } as NodeJS.ProcessEnv,
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

async function expectSqlError(sql: string, params: unknown[], pattern: RegExp): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await expect(client.query(sql, params)).rejects.toThrow(pattern);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

describeIfDb("tenant wipe (migration 020)", () => {
  let a: Tenant; // is_test: gets wiped
  let demo: Tenant; // is_demo: gets wiped via CLI
  let keep: Tenant; // customer tenant: must never change
  let keepBefore: Record<string, number>;
  let keepBundleBefore: unknown;
  let keepPublicBefore: unknown;

  beforeAll(async () => {
    await migrateUp();
    keep = await seedTenant(SLUG_OTHER, {});
    // Account shared between the wipeable tenant and the customer tenant.
    a = await seedTenant(SLUG_TEST, { is_test: true }, { sharedAccountWith: `admin-${SLUG_OTHER}@wipe.test` });
    demo = await seedTenant(SLUG_DEMO, { is_demo: true });
    keepBefore = await snapshot(keep.orgId);
    const bundle = await loadEvidenceBundle(getPool(), keep.orgId, keep.traceId);
    expect(bundle).not.toBeNull();
    keepBundleBefore = bundle;
    keepPublicBefore = await buildPublicVerificationBundle(getPool(), keep.slug, keep.eventIds[0]!);
    expect(keepPublicBefore).not.toBeNull();
  }, 120_000);

  afterAll(async () => {
    const pool = getPool();
    // Test hygiene: leftovers are removed through the same, owner-only function.
    for (const slug of [SLUG_TEST, SLUG_DEMO]) {
      const r = await q(`SELECT 1 FROM organization WHERE slug = $1`, [slug]);
      if (r.length) await q(`SELECT platform_wipe_tenant($1, true, $2)`, [slug, TEST_ACTOR]);
    }
    await q(`UPDATE organization SET is_test = true WHERE slug = $1`, [SLUG_OTHER]);
    await q(`SELECT platform_wipe_tenant($1, true, $2)`, [SLUG_OTHER, TEST_ACTOR]).catch(() => undefined);
    await q(`DELETE FROM organization WHERE slug = $1`, [SLUG_SMOKE_UNFLAGGED]);
    await q(`DROP TABLE IF EXISTS zz_unmapped_tenant_table`);
    await q(`DELETE FROM account WHERE email LIKE '%@wipe.test'`);
    await q(`DELETE FROM receipt_signing_key WHERE key_id LIKE 'rcpt-wipe-%'`).catch(() => undefined);
    // The audit table is append-only; test rows are cleared only here, under replica role.
    const c = await pool.connect();
    try {
      await c.query(`SET session_replication_role = replica`);
      await c.query(`DELETE FROM platform_tenant_wipe_audit WHERE actor LIKE '%${TEST_ACTOR}%'`);
    } finally {
      await c.query(`SET session_replication_role = DEFAULT`).catch(() => undefined);
      c.release();
    }
    await q(`DROP OWNED BY ${APP_ROLE}`).catch(() => undefined);
    await q(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => undefined);
    await closePool();
  }, 60_000);

  it("seeded tenants really hold rows in many tables (so 'zero left' means something)", async () => {
    const snap = await snapshot(a.orgId);
    const populated = Object.entries(snap).filter(([, n]) => n > 0).map(([t]) => t);
    for (const t of [
      "event", "trace", "forensic_receipt", "forensic_receipt_seq", "merkle_root", "inclusion_proof",
      "transparency_log_entry", "approval", "policy", "policy_rule", "session", "membership",
      "organization_invitation", "ingest_api_key", "agent", "signing_key", "audit_log",
      "receipt_access_log", "idempotency_record", "webhook_endpoint", "compliance_export",
    ]) {
      expect(snap[t], `${t} should be seeded`).toBeGreaterThan(0);
    }
    expect(populated.length).toBeGreaterThanOrEqual(24);
  });

  it("dry run is the default: reports counts and deletes nothing", async () => {
    const before = await snapshot(a.orgId);
    const report = await callWipeFunction({
      connectionString: databaseUrl!, slug: SLUG_TEST, mode: "dry_run", actor: TEST_ACTOR,
    });
    expect(report.dry_run).toBe(true);
    expect(report.row_counts.event).toBe(before.event);
    expect(report.row_counts.forensic_receipt).toBe(3);
    expect(await snapshot(a.orgId)).toEqual(before);
  });

  it("refuses without --confirm or without AEGIS_ALLOW_TENANT_WIPE (pure decision)", () => {
    expect(decideWipeMode({ slug: "x", confirm: undefined, env: { AEGIS_ALLOW_TENANT_WIPE: "1" } })).toBe("dry_run");
    expect(() => decideWipeMode({ slug: "x", confirm: "x", env: {} })).toThrow(WipeRefusal);
    expect(() => decideWipeMode({ slug: "x", confirm: "x", env: { AEGIS_ALLOW_TENANT_WIPE: "true" } })).toThrow(/needs AEGIS_ALLOW_TENANT_WIPE=1/);
    expect(() => decideWipeMode({ slug: "x", confirm: "y", env: { AEGIS_ALLOW_TENANT_WIPE: "1" } })).toThrow(/repeat the slug/);
    expect(() => decideWipeMode({ slug: undefined, confirm: "x", env: { AEGIS_ALLOW_TENANT_WIPE: "1" } })).toThrow(/--slug/);
    expect(decideWipeMode({ slug: "x", confirm: "x", env: { AEGIS_ALLOW_TENANT_WIPE: "1" } })).toBe("execute");
  });

  it("CLI: no --confirm = dry run; wrong --confirm or missing env = refused, nothing deleted", async () => {
    const before = await snapshot(demo.orgId);

    const dry = runCli(["--slug", SLUG_DEMO], {});
    expect(dry.status, dry.out).toBe(0);
    expect(dry.out).toContain("DRY RUN");

    const dryWithEnv = runCli(["--slug", SLUG_DEMO], { AEGIS_ALLOW_TENANT_WIPE: "1" });
    expect(dryWithEnv.status, dryWithEnv.out).toBe(0);
    expect(dryWithEnv.out).toContain("DRY RUN");

    const noEnv = runCli(["--slug", SLUG_DEMO, "--confirm", SLUG_DEMO], {});
    expect(noEnv.status, noEnv.out).toBe(2);
    expect(noEnv.out).toMatch(/AEGIS_ALLOW_TENANT_WIPE=1/);

    const wrong = runCli(["--slug", SLUG_DEMO, "--confirm", "something-else"], { AEGIS_ALLOW_TENANT_WIPE: "1" });
    expect(wrong.status, wrong.out).toBe(2);
    expect(wrong.out).toMatch(/must repeat the slug/);

    expect(await snapshot(demo.orgId)).toEqual(before);
  }, 60_000);

  it("CLI refuses a customer tenant even with --confirm and the env opt-in", async () => {
    const res = runCli(["--slug", SLUG_OTHER, "--confirm", SLUG_OTHER], { AEGIS_ALLOW_TENANT_WIPE: "1" });
    expect(res.status, res.out).toBe(2);
    expect(res.out).toMatch(/not_wipeable/);
    expect(res.out).toMatch(/neither is_demo nor is_test/);
    expect(await snapshot(keep.orgId)).toEqual(keepBefore);
  }, 60_000);

  it("database function refuses non-demo/non-test tenants, a smoke-looking slug alone, and the platform org", async () => {
    await expect(
      callWipeFunction({ connectionString: databaseUrl!, slug: SLUG_OTHER, mode: "execute", actor: TEST_ACTOR }),
    ).rejects.toMatchObject({ name: "WipeRefusal", code: "not_wipeable" });

    // Slug contains "smoke" but neither flag is set: NOT treated as test inside the function.
    await newOrg(SLUG_SMOKE_UNFLAGGED, {});
    await expect(
      callWipeFunction({ connectionString: databaseUrl!, slug: SLUG_SMOKE_UNFLAGGED, mode: "execute", actor: TEST_ACTOR }),
    ).rejects.toMatchObject({ code: "not_wipeable" });

    // The platform organisation is refused even if someone flags it.
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE organization SET is_test = true WHERE slug = 'salanor-platform'`);
      await expect(client.query(`SELECT platform_wipe_tenant('salanor-platform', true, $1)`, [TEST_ACTOR])).rejects.toThrow(
        /platform organisation/,
      );
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect((await q(`SELECT is_test FROM organization WHERE slug = 'salanor-platform'`))[0]!.is_test).toBe(false);

    await expect(
      callWipeFunction({ connectionString: databaseUrl!, slug: "no-such-tenant-xyz", mode: "dry_run", actor: TEST_ACTOR }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("an unmapped tenant table holding the tenant's rows aborts the wipe (nothing deleted)", async () => {
    await q(`CREATE TABLE zz_unmapped_tenant_table (organization_id uuid NOT NULL)`);
    await q(`INSERT INTO zz_unmapped_tenant_table VALUES ($1)`, [a.orgId]);
    const before = await snapshot(a.orgId);
    await expectSqlError(`SELECT platform_wipe_tenant($1, true, $2)`, [SLUG_TEST, TEST_ACTOR], /tenant_wipe_unmapped_table/);
    expect(await snapshot(a.orgId)).toEqual(before);
    await q(`DROP TABLE zz_unmapped_tenant_table`);
  });

  it("the app role cannot call the wipe function or bypass the append-only triggers", async () => {
    await q(`DROP OWNED BY ${APP_ROLE}`).catch(() => undefined);
    await q(`DROP ROLE IF EXISTS ${APP_ROLE}`);
    await q(`CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    await q(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    // Worst case: the prod-like script's blanket DML grant on every table.
    await q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await q(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    // 001_baseline only revokes from aegis_app when that role exists; fresh CI DBs still
    // have PUBLIC EXECUTE on the function — mirror the owner-only posture here.
    await q(`REVOKE ALL ON FUNCTION platform_wipe_tenant(text, boolean, text) FROM PUBLIC`);
    await q(`REVOKE ALL ON FUNCTION platform_wipe_tenant(text, boolean, text) FROM ${APP_ROLE}`);

    const as = async (sql: string, params: unknown[] = []) => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
        const who = await client.query<{ current_user: string }>(`SELECT current_user`);
        expect(who.rows[0]!.current_user).toBe(APP_ROLE);
        await client.query(sql, params);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    };
    await expect(as(`SELECT platform_wipe_tenant($1, true, 'x')`, [SLUG_TEST])).rejects.toThrow(/permission denied for function platform_wipe_tenant/);
    await expect(as(`SELECT platform_wipe_tenant($1, false, 'x')`, [SLUG_TEST])).rejects.toThrow(/permission denied/);
    expect((await snapshot(a.orgId)).event).toBeGreaterThan(0);
    await expect(as(`DELETE FROM event WHERE organization_id = $1`, [a.orgId])).rejects.toThrow(/append_only: sealed event rows cannot be deleted/);
    await expect(as(`DELETE FROM forensic_receipt WHERE organization_id = $1`, [a.orgId])).rejects.toThrow(/append_only: forensic receipts cannot be deleted/);
    await expect(as(`SET LOCAL session_replication_role = replica`)).rejects.toThrow(/permission denied/);
    await expect(as(`ALTER TABLE event DISABLE TRIGGER trg_event_append_only`)).rejects.toThrow(/must be owner/);
    // Seed an audit row — DELETE of zero rows would not fire the append-only trigger.
    await q(
      `INSERT INTO platform_tenant_wipe_audit
        (tenant_slug, tenant_name, tenant_organization_id, tenant_flags, actor, row_counts, accounts_deleted)
       VALUES ('wipe-priv-probe', 'probe', $1, '{}'::jsonb, $2, '{}'::jsonb, 0)`,
      [a.orgId, TEST_ACTOR],
    );
    await expect(as(`DELETE FROM platform_tenant_wipe_audit`)).rejects.toThrow(/append_only: platform_tenant_wipe_audit/);

    // The function is not executable by PUBLIC / app role.
    const acl = await q<{ ok: boolean }>(
      `SELECT has_function_privilege($1, 'platform_wipe_tenant(text,boolean,text)', 'EXECUTE') AS ok`,
      [APP_ROLE],
    );
    expect(acl[0]!.ok).toBe(false);
  });

  it("real wipe via CLI (--confirm + env) removes the demo tenant completely and writes the platform audit row", async () => {
    const before = await snapshot(demo.orgId);
    expect(before.event).toBeGreaterThan(0);
    const res = runCli(["--slug", SLUG_DEMO, "--confirm", SLUG_DEMO], { AEGIS_ALLOW_TENANT_WIPE: "1" });
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain("WIPED");

    const after = await snapshot(demo.orgId);
    expect(Object.values(after).every((n) => n === 0), JSON.stringify(after)).toBe(true);

    const audit = await q<{ tenant_slug: string; actor: string; row_counts: Record<string, number>; tenant_organization_id: string }>(
      `SELECT tenant_slug, actor, row_counts, tenant_organization_id FROM platform_tenant_wipe_audit WHERE tenant_slug = $1`,
      [SLUG_DEMO],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor).toContain(TEST_ACTOR);
    expect(audit[0]!.tenant_organization_id).toBe(demo.orgId);
    expect(audit[0]!.row_counts.event).toBe(before.event);
    expect(audit[0]!.row_counts.forensic_receipt).toBe(before.forensic_receipt);
  }, 60_000);

  it("wipe of the is_test tenant leaves zero rows, keeps the shared account, drops sole-tenant accounts", async () => {
    const report = await callWipeFunction({
      connectionString: databaseUrl!, slug: SLUG_TEST, mode: "execute", actor: TEST_ACTOR,
    });
    expect(report.dry_run).toBe(false);
    expect(report.audit_id).toBeTruthy();
    expect(report.accounts_kept_other_tenants).toBe(1);

    const after = await snapshot(a.orgId);
    expect(Object.values(after).every((n) => n === 0), JSON.stringify(after)).toBe(true);

    // Sole-tenant accounts are gone; the account that also belongs to the customer tenant stays.
    const gone = await q(`SELECT 1 FROM account WHERE email IN ($1, $2)`, [
      `admin-${SLUG_TEST}@wipe.test`, `member-${SLUG_TEST}@wipe.test`,
    ]);
    expect(gone).toHaveLength(0);
    const kept = await q<{ account_id: string }>(`SELECT account_id FROM account WHERE account_id = $1`, [a.sharedAccountId]);
    expect(kept).toHaveLength(1);
    const keptMembership = await q(`SELECT 1 FROM membership WHERE account_id = $1 AND organization_id = $2`, [
      a.sharedAccountId, keep.orgId,
    ]);
    expect(keptMembership).toHaveLength(1);

    // Triggers are back on (the disable was transactional) and the audit row survived.
    const trg = await q<{ tgname: string; tgenabled: string }>(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname IN ('trg_event_append_only','trg_forensic_receipt_append_only')`,
    );
    expect(trg).toHaveLength(2);
    expect(trg.every((t) => t.tgenabled === "O")).toBe(true);
    expect(await q(`SELECT 1 FROM platform_tenant_wipe_audit WHERE tenant_slug = $1`, [SLUG_TEST])).toHaveLength(1);
  });

  it("other tenants are unchanged: row counts identical", async () => {
    expect(await snapshot(keep.orgId)).toEqual(keepBefore);
  });

  it("another tenant's evidence still verifies OFFLINE after the wipe (event chain, witness, transparency, receipts)", async () => {
    // Forensic evidence bundle: rebuilt from the DB after the wipe, then verified with no DB at all.
    const bundleAfter = await loadEvidenceBundle(getPool(), keep.orgId, keep.traceId);
    expect(bundleAfter).not.toBeNull();
    // Identical to the bundle built before the wipe (only the wall-clock export stamp differs).
    const stable = (b: unknown) => {
      const o = JSON.parse(JSON.stringify(b)) as Record<string, unknown>;
      delete o.generated_at_utc;
      return o;
    };
    expect(stable(bundleAfter)).toEqual(stable(keepBundleBefore));
    const verdict = await verifyBundleFile(JSON.parse(JSON.stringify(bundleAfter)));
    expect(verdict.ok, JSON.stringify(verdict.findings)).toBe(true);
    expect(verdict.checks.filter((c) => c.status === "fail")).toHaveLength(0);

    // Public witness + transparency bundle (merkle inclusion + transparency log), third-party verifier.
    const publicAfter = await buildPublicVerificationBundle(getPool(), keep.slug, keep.eventIds[0]!);
    expect(publicAfter).toEqual(keepPublicBefore);
    const v = verifyPublicBundle(publicAfter!);
    expect(v.errors, JSON.stringify(v)).toEqual([]);
    expect(v.ok && v.witness_ok && v.transparency_ok && v.leaf_ok).toBe(true);

    // Every event of the surviving tenant still chains: no gaps, same hashes as before.
    const chain = await q<{ sequence_num: string; prev_event_hash: string | null; event_hash: string }>(
      `SELECT sequence_num::text, prev_event_hash, event_hash FROM event WHERE organization_id = $1 ORDER BY sequence_num`,
      [keep.orgId],
    );
    expect(chain).toHaveLength(3);
    for (let i = 1; i < chain.length; i++) expect(chain[i]!.prev_event_hash).toBe(chain[i - 1]!.event_hash);
  });

  it("stable ingest key: the same DEMO_BANK_INGEST_KEY survives wipe + re-provision (stored hashed)", async () => {
    const secret = `aegis_${randomBytes(24).toString("hex")}`;
    const slug = `wipe-fresh-${run}`;
    const first = await newOrg(slug, { is_demo: true });
    const r1 = await platformSetStableIngestKey(getPool(), first, { name: "demo-bank-simulator", secret });
    expect(r1.action).toBe("created");
    const again = await platformSetStableIngestKey(getPool(), first, { name: "demo-bank-simulator", secret });
    expect(again.action).toBe("reused");
    expect(again.key_id).toBe(r1.key_id);
    const row = await q<{ key_hash: string; key_prefix: string }>(`SELECT key_hash, key_prefix FROM ingest_api_key WHERE key_id = $1`, [r1.key_id]);
    expect(row[0]!.key_hash).toBe(hashIngestKey(secret));
    expect(row[0]!.key_hash).toBe(createHash("sha256").update(secret, "utf8").digest("hex"));
    expect(JSON.stringify(row)).not.toContain(secret); // only the hash and an 8-char prefix are stored

    // demo:fresh: wipe, re-create the org, store the same secret again.
    const wipe = await callWipeFunction({ connectionString: databaseUrl!, slug, mode: "execute", actor: TEST_ACTOR });
    expect(wipe.row_counts.ingest_api_key).toBe(1);
    expect(await q(`SELECT 1 FROM ingest_api_key WHERE organization_id = $1`, [first])).toHaveLength(0);
    const second = await newOrg(slug, { is_demo: true });
    expect(second).not.toBe(first); // new tenant id ...
    const r2 = await platformSetStableIngestKey(getPool(), second, { name: "demo-bank-simulator", secret });
    expect(r2.action).toBe("created");
    const row2 = await q<{ key_hash: string; key_prefix: string; organization_id: string }>(
      `SELECT key_hash, key_prefix, organization_id FROM ingest_api_key WHERE key_id = $1`, [r2.key_id],
    );
    // ... but the ingest key is identical: same hash, same prefix, resolves to the new org.
    expect(row2[0]!.key_hash).toBe(row[0]!.key_hash);
    expect(row2[0]!.key_prefix).toBe(row[0]!.key_prefix);
    expect(row2[0]!.organization_id).toBe(second);
    const resolved = await q<{ organization_id: string }>(
      `SELECT organization_id FROM ingest_api_key WHERE key_hash = $1 AND active = true`, [hashIngestKey(secret)],
    );
    expect(resolved).toEqual([{ organization_id: second }]);

    // A different secret replaces (revokes) the old one; weak secrets and customer tenants are refused.
    const other = `aegis_${randomBytes(24).toString("hex")}`;
    expect((await platformSetStableIngestKey(getPool(), second, { name: "demo-bank-simulator", secret: other })).action).toBe("replaced");
    await expect(platformSetStableIngestKey(getPool(), second, { name: "demo-bank-simulator", secret: "short" })).rejects.toMatchObject({ code: "weak_secret" });
    await expect(platformSetStableIngestKey(getPool(), keep.orgId, { name: "x", secret })).rejects.toMatchObject({ code: "not_demo_or_test" });

    await callWipeFunction({ connectionString: databaseUrl!, slug, mode: "execute", actor: TEST_ACTOR });
  });
});
