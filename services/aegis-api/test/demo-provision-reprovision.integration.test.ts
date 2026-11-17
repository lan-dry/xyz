/**
 * demo:fresh path: provision → wipe → provision again → seed → personas can log in
 * with the correct console + bank roles, without account_exists.
 *
 * Exercises platformEnsureOrganizationMember (the same helper pilot:provision-demo-tenant
 * calls after a wipe when persona accounts already exist in the ID service).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hashPassword,
  platformEnsureOrganizationMember,
  provisionOrganization,
  verifyAccountPassword,
  pickDefaultOrganizationId,
} from "@salanor/platform-auth";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { applyDemoPack } from "../src/packs/apply-pack.js";
import { DEMO_TENANT_ESCALATION } from "../src/bank/demo-tenant.js";
import { callWipeFunction } from "../../../tools/demo/tenant-wipe-lib.mts";
import { PERSONA_BANK_ROLE } from "../../../tools/demo/demo-tenant-lib.mts";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const run = randomUUID().replace(/-/g, "").slice(0, 8);
const SLUG = `prov-fresh-${run}`;
const KEEP_SLUG = `prov-keep-${run}`;
const PASSWORD = "reprovision-persona-password-ok";
const TEST_ACTOR = "vitest-demo-reprovision";

const PERSONAS = [
  { key: "officer", email: `officer-${run}@prov.test`, display: "Officer", bank: "credit_officer" },
  { key: "manager", email: `manager-${run}@prov.test`, display: "Manager", bank: "credit_manager" },
  { key: "compliance", email: `comp-${run}@prov.test`, display: "Compliance", bank: "compliance_officer" },
  { key: "head", email: `head-${run}@prov.test`, display: "Head", bank: "head_of_compliance" },
  { key: "dpo", email: `dpo-${run}@prov.test`, display: "DPO", bank: "dpo" },
  { key: "deputy", email: `deputy-${run}@prov.test`, display: "Deputy", bank: null },
] as const;

async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await getPool().query<T>(sql, params)).rows;
}

async function provisionDemoLike(slug: string): Promise<string> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const org = await provisionOrganization(client, {
      name: `Prov ${slug}`,
      slug,
      adminEmail: `admin-${run}@prov.test`,
      adminDisplayName: "Admin",
      adminPasswordHash: hashPassword(PASSWORD),
      plan: "enterprise",
      isDemo: true,
    });
    for (const p of PERSONAS) {
      await platformEnsureOrganizationMember(client, {
        organizationId: org.organization_id,
        email: p.email,
        role: "approver",
        displayName: p.display,
        passwordHash: hashPassword(PASSWORD),
      });
    }
    await applyDemoPack(client, org.organization_id, "banking", {
      escalation: {
        afterMs: DEMO_TENANT_ESCALATION.afterMs,
        toRole: DEMO_TENANT_ESCALATION.toRole,
      },
    });
    for (const p of PERSONAS) {
      if (!p.bank) continue;
      const mem = await client.query<{ membership_id: string }>(
        `SELECT m.membership_id
           FROM membership m JOIN account a ON a.account_id = m.account_id
          WHERE m.organization_id = $1 AND lower(a.email) = $2 AND m.status = 'active'`,
        [org.organization_id, p.email.toLowerCase()],
      );
      await client.query(
        `INSERT INTO membership_bank_role (membership_id, organization_id, role_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (membership_id, role_key) DO NOTHING`,
        [mem.rows[0]!.membership_id, org.organization_id, p.bank],
      );
    }
    // Seed marker (pilot:seed-history equivalent for this unit): history present after provision.
    await client.query(
      `INSERT INTO audit_log (organization_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, 'demo.seed_history', 'organization', $2, '{"cases":11}'::jsonb)`,
      [org.organization_id, org.organization_id],
    );
    await client.query("COMMIT");
    return org.organization_id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function assertPersonasCanLogin(orgId: string): Promise<void> {
  const pool = getPool();
  for (const p of PERSONAS) {
    const verified = await verifyAccountPassword(pool, p.email, PASSWORD);
    expect(verified, `${p.key} password`).toBeTruthy();
    const picked = await pickDefaultOrganizationId(pool, verified!.accountId, orgId);
    expect(picked, `${p.key} org membership`).toBe(orgId);
    const mem = await q<{ role: string; status: string }>(
      `SELECT m.role, m.status
         FROM membership m
        WHERE m.organization_id = $1 AND m.account_id = $2`,
      [orgId, verified!.accountId],
    );
    expect(mem[0]).toEqual({ role: "approver", status: "active" });
    const expectedBank = PERSONA_BANK_ROLE[p.key as keyof typeof PERSONA_BANK_ROLE];
    if (expectedBank) {
      const roles = await q<{ role_key: string }>(
        `SELECT role_key FROM membership_bank_role
          WHERE organization_id = $1 AND membership_id = (
            SELECT membership_id FROM membership
             WHERE organization_id = $1 AND account_id = $2
          )`,
        [orgId, verified!.accountId],
      );
      expect(roles.map((r) => r.role_key)).toContain(expectedBank);
    }
  }
  const admin = await verifyAccountPassword(pool, `admin-${run}@prov.test`, PASSWORD);
  expect(admin).toBeTruthy();
  expect(await pickDefaultOrganizationId(pool, admin!.accountId, orgId)).toBe(orgId);
}

describeIfDb("demo provision → wipe → provision → seed → login", () => {
  beforeAll(async () => {
    await migrateUp(getPool());
  }, 120_000);

  afterAll(async () => {
    await callWipeFunction({
      connectionString: databaseUrl!,
      slug: SLUG,
      mode: "execute",
      actor: TEST_ACTOR,
    }).catch(() => undefined);
    // keep org is a customer tenant (not wipeable); drop manually
    await getPool()
      .query(`DELETE FROM organization WHERE slug = $1`, [KEEP_SLUG])
      .catch(() => undefined);
    await closePool();
  });

  it("re-joins existing persona accounts after wipe with no account_exists gap", async () => {
    // A second membership keeps persona accounts alive across wipe (accounts_kept_other_tenants).
    // That is the real account_exists failure mode: invite works, signup-accept refuses.
    const keep = await provisionOrganization(getPool(), {
      name: `Keep ${KEEP_SLUG}`,
      slug: KEEP_SLUG,
      adminEmail: `keep-admin-${run}@prov.test`,
      adminDisplayName: "Keep Admin",
      adminPasswordHash: hashPassword(PASSWORD),
      plan: "enterprise",
    });

    const firstOrgId = await provisionDemoLike(SLUG);
    await assertPersonasCanLogin(firstOrgId);

    // Attach the same persona accounts to the keep org so wipe will not delete them.
    for (const p of PERSONAS) {
      await platformEnsureOrganizationMember(getPool(), {
        organizationId: keep.organization_id,
        email: p.email,
        role: "viewer",
      });
    }

    const accountIdsBefore = await q<{ account_id: string; email: string }>(
      `SELECT account_id, email FROM account
        WHERE lower(email) = ANY($1::text[])`,
      [PERSONAS.map((p) => p.email.toLowerCase())],
    );
    expect(accountIdsBefore).toHaveLength(PERSONAS.length);

    const wipe = await callWipeFunction({
      connectionString: databaseUrl!,
      slug: SLUG,
      mode: "execute",
      actor: TEST_ACTOR,
    });
    expect(wipe.dry_run).toBe(false);
    expect(wipe.accounts_kept_other_tenants).toBeGreaterThanOrEqual(PERSONAS.length);
    expect(await q(`SELECT 1 FROM organization WHERE organization_id = $1`, [firstOrgId])).toHaveLength(0);

    // Accounts survive the wipe (the failure mode that used to yield account_exists on invite accept).
    const accountsAfterWipe = await q<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = ANY($1::text[])`,
      [PERSONAS.map((p) => p.email.toLowerCase())],
    );
    expect(accountsAfterWipe).toHaveLength(PERSONAS.length);
    expect(accountsAfterWipe.map((a) => a.account_id).sort()).toEqual(
      accountIdsBefore.map((a) => a.account_id).sort(),
    );
    // No membership on the wiped org — joining must re-attach, not signup-accept.
    for (const row of accountIdsBefore) {
      const mem = await q(
        `SELECT 1 FROM membership m
          JOIN organization o ON o.organization_id = m.organization_id
         WHERE m.account_id = $1 AND o.slug = $2`,
        [row.account_id, SLUG],
      );
      expect(mem).toHaveLength(0);
    }

    const secondOrgId = await provisionDemoLike(SLUG);
    expect(secondOrgId).not.toBe(firstOrgId);

    // Same accounts, new memberships — ensure path reused accounts (no duplicate emails).
    const accountsAfter = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM account WHERE lower(email) = ANY($1::text[])`,
      [PERSONAS.map((p) => p.email.toLowerCase())],
    );
    expect(Number(accountsAfter[0]!.n)).toBe(PERSONAS.length);

    await assertPersonasCanLogin(secondOrgId);

    // Idempotent second ensure (provision re-run without wipe).
    const client = await getPool().connect();
    try {
      for (const p of PERSONAS) {
        const again = await platformEnsureOrganizationMember(client, {
          organizationId: secondOrgId,
          email: p.email,
          role: "approver",
          displayName: p.display,
          passwordHash: hashPassword(PASSWORD),
        });
        expect(again.action).toBe("reused");
      }
    } finally {
      client.release();
    }
    await assertPersonasCanLogin(secondOrgId);

    // Seed marker present on the new org.
    const seeded = await q(
      `SELECT 1 FROM audit_log WHERE organization_id = $1 AND action = 'demo.seed_history'`,
      [secondOrgId],
    );
    expect(seeded.length).toBeGreaterThan(0);
  }, 120_000);
});
