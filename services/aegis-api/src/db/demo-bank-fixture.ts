/**
 * Demo Bank presenting organisation (slug `demo-bank`) and its scratch twin
 * (`demo-bank-rehearsal`). Local / demo-mode only.
 *
 * Ensures: organisation, four governed agents with dev signing keys + DIDs
 * (same pattern as `pilot-demo-data.ts`), org-scoped ingest key, and the admin
 * console user `admin@demo.test` (password = AEGIS_DEMO_APPROVAL_PASSWORD).
 * Approvers (officer/manager/comp/head/dpo@demo.test) and the banking pack are
 * applied separately by `pack:apply --seed-approvers`.
 *
 * No real person's email is ever attached to a demo org: members are only
 * `*@demo.test` accounts.
 */
import { createHash } from "node:crypto";
import { hashPassword } from "@salanor/platform-auth";
import type pg from "pg";
import { assertDemoMode, isDemoModeAllowed } from "../bank/demo-clock.js";
import { demoApprovalPassword } from "../demo/seed-approval-actors.js";
import { pilotSigningPublicKeyB64, upsertAgent } from "./pilot-demo-data.js";

export const DEMO_BANK_SLUG = "demo-bank";
export const DEMO_BANK_NAME = "Demo Bank";
/** Scratch org for `demo:rehearse` so rehearsal never dirties the presenting org. */
export const DEMO_BANK_REHEARSAL_SLUG = "demo-bank-rehearsal";
export const DEMO_BANK_REHEARSAL_NAME = "Demo Bank (rehearsal scratch)";
export const DEMO_ADMIN_EMAIL = "admin@demo.test";
/** Synthetic person name shown on screens; the email stays in Technical details only. */
export const DEMO_ADMIN_DISPLAY_NAME = "Theogene Rugamba";

export const DEMO_BANK_AGENTS = [
  { suffix: "credit-decision", displayName: "Credit Decision Engine" },
  { suffix: "payments-gateway", displayName: "Payments Gateway" },
  { suffix: "customer-data", displayName: "Customer Data Service" },
  { suffix: "core-banking", displayName: "Core Banking Adapter" },
] as const;

export type DemoBankAgentKey = (typeof DEMO_BANK_AGENTS)[number]["suffix"];

/** Globally-unique agent_id / key_id / DID for an org slug (PKs are global). */
export function demoBankAgentIds(slug: string, suffix: string) {
  return {
    agentId: `agent-${slug}-${suffix}`,
    keyId: `key-${slug}-${suffix}`,
    did: `did:salanor:${slug}:${suffix}`,
  };
}

/** Raw ingest key for the presenting org (never has a built-in default). */
export function demoBankIngestKey(): string {
  const raw =
    process.env.AEGIS_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_DEV_KEY?.trim();
  if (!raw) {
    throw new Error(
      "AEGIS_INGEST_KEY or AEGIS_INGEST_DEV_KEY is required to wire the Demo Bank ingest key",
    );
  }
  return raw;
}

/**
 * Scratch-org ingest key, derived from the presenting key so the rehearsal
 * script and this fixture agree without a second secret.
 * (Mirrored in tools/demo/demo-rehearse.mjs.)
 */
export function demoBankRehearsalIngestKey(baseKey = demoBankIngestKey()): string {
  const digest = createHash("sha256")
    .update(`${baseKey}:demo-bank-rehearsal`, "utf8")
    .digest("hex");
  return `aegis_rehearsal_${digest.slice(0, 32)}`;
}

function ingestKeyId(slug: string): string {
  // Deterministic UUID-shaped id per org slug.
  const h = createHash("sha256").update(`ingest:${slug}`, "utf8").digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type EnsureDemoBankOptions = {
  slug?: string;
  name?: string;
  /** Raw ingest key to bind to this org. Defaults by slug. */
  ingestKey?: string;
};

export type EnsureDemoBankResult = {
  organizationId: string;
  slug: string;
  name: string;
  adminEmail: string;
  agentIds: string[];
  ingestKeyPrefix: string;
};

export async function ensureDemoBankOrganization(
  client: pg.Pool | pg.PoolClient,
  options: EnsureDemoBankOptions = {},
): Promise<EnsureDemoBankResult> {
  assertDemoMode("ensure Demo Bank organisation");
  if (!isDemoModeAllowed()) {
    throw new Error("Demo Bank fixture refused: demo mode not allowed");
  }
  const slug = options.slug ?? DEMO_BANK_SLUG;
  const name =
    options.name ??
    (slug === DEMO_BANK_REHEARSAL_SLUG
      ? DEMO_BANK_REHEARSAL_NAME
      : DEMO_BANK_NAME);
  const rawIngest =
    options.ingestKey ??
    (slug === DEMO_BANK_REHEARSAL_SLUG
      ? demoBankRehearsalIngestKey()
      : demoBankIngestKey());
  const password = demoApprovalPassword();
  const verifyPath = `/v1/public/orgs/${slug}/verify`;
  const publicKeyB64 = await pilotSigningPublicKeyB64();

  // Hosted / production-style Demo Bank is flagged is_demo so the console shows the
  // quiet "Demo organisation" tag (not the bank_demo strip) when the UI profile is default.
  const org = await client.query<{ organization_id: string }>(
    `INSERT INTO organization (name, slug, onboarding_completed_at, active, is_demo)
     VALUES ($1, $2, now(), true, true)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       active = true,
       is_demo = true,
       onboarding_completed_at = COALESCE(organization.onboarding_completed_at, now()),
       updated_at = now()
     RETURNING organization_id`,
    [name, slug],
  );
  const organizationId = org.rows[0]?.organization_id;
  if (!organizationId) {
    throw new Error(`Could not create organisation ${slug}`);
  }

  // Agents + signing keys + DID documents (no default policy yet; pack:apply
  // activates the banking policy afterwards).
  const agentIds: string[] = [];
  for (const a of DEMO_BANK_AGENTS) {
    const ids = demoBankAgentIds(slug, a.suffix);
    await upsertAgent(client, {
      organizationId,
      agentId: ids.agentId,
      did: ids.did,
      slug: a.suffix,
      displayName: a.displayName,
      publicKeyB64,
      keyId: ids.keyId,
      verifyPath,
      policyId: null,
    });
    agentIds.push(ids.agentId);
  }

  // Ingest key bound to this org. A hash can only resolve to ONE org, so any
  // other org's row with the same hash (e.g. Northwind pilot fixture sharing
  // the dev key) is revoked in this demo database.
  const keyHash = createHash("sha256").update(rawIngest, "utf8").digest("hex");
  await client.query(
    `INSERT INTO ingest_api_key (key_id, organization_id, name, key_prefix, key_hash, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (key_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       key_prefix = EXCLUDED.key_prefix,
       key_hash = EXCLUDED.key_hash,
       active = true,
       revoked_at = NULL`,
    [ingestKeyId(slug), organizationId, `${name} ingest`, rawIngest.slice(0, 8), keyHash],
  );
  await client.query(
    `UPDATE ingest_api_key
        SET active = false, revoked_at = now()
      WHERE key_hash = $1
        AND organization_id <> $2
        AND active = true`,
    [keyHash, organizationId],
  );

  // Console admin (demo.test only — never a real founder address).
  const passwordHash = hashPassword(password);
  const existing = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = $1`,
    [DEMO_ADMIN_EMAIL],
  );
  let accountId: string;
  if (existing.rows[0]) {
    accountId = existing.rows[0].account_id;
    await client.query(
      `UPDATE account SET
         display_name = $3,
         password_hash = $2,
         email_verified_at = COALESCE(email_verified_at, now()),
         active = true,
         updated_at = now()
       WHERE account_id = $1`,
      [accountId, passwordHash, DEMO_ADMIN_DISPLAY_NAME],
    );
  } else {
    const inserted = await client.query<{ account_id: string }>(
      `INSERT INTO account (email, display_name, password_hash, email_verified_at, active)
       VALUES ($1, $3, $2, now(), true)
       RETURNING account_id`,
      [DEMO_ADMIN_EMAIL, passwordHash, DEMO_ADMIN_DISPLAY_NAME],
    );
    accountId = inserted.rows[0]!.account_id;
  }
  await client.query(
    `INSERT INTO membership (account_id, organization_id, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (organization_id, account_id) DO UPDATE SET role = 'admin', status = 'active'`,
    [accountId, organizationId],
  );

  return {
    organizationId,
    slug,
    name,
    adminEmail: DEMO_ADMIN_EMAIL,
    agentIds,
    ingestKeyPrefix: rawIngest.slice(0, 8),
  };
}
