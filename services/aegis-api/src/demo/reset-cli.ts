/**
 * Demo reset — refuses production (D5).
 * Usage: AEGIS_DEMO_MODE=true pnpm --filter aegis-api demo:reset
 *        (defaults to Demo Bank, slug `demo-bank`; override with --org <uuid>,
 *         --rehearsal, or --slug <slug>; add --keep-pack to keep the pack)
 */
import "../db/load-env.js";
import { assertDemoMode } from "../bank/demo-clock.js";
import { resetDemoOrganization } from "./reset-org.js";
import {
  DEMO_BANK_REHEARSAL_SLUG,
  DEMO_BANK_SLUG,
} from "../db/demo-bank-fixture.js";
import type pg from "pg";
import { getPool } from "../db/pool.js";
import { getOrganizationIdBySlug } from "../db/resolve-organization.js";

/**
 * Target org precedence:
 *   1. --org <uuid>
 *   2. --rehearsal (slug demo-bank-rehearsal) or --slug <slug>
 *   3. Demo Bank by slug `demo-bank` (never needs --org once the org exists)
 *   4. AEGIS_ORGANIZATION_ID (fallback only when Demo Bank does not exist)
 * Demo Bank outranks the env var on purpose: a stale .env id (e.g. Northwind)
 * must not be wiped by an argument-less `pnpm demo:reset`.
 */
async function resolveResetOrgId(
  client: pg.PoolClient,
  args: string[],
): Promise<string | null> {
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const explicit = value("--org");
  if (explicit) return explicit;
  const slug = args.includes("--rehearsal")
    ? DEMO_BANK_REHEARSAL_SLUG
    : (value("--slug") ?? DEMO_BANK_SLUG);
  const bySlug = await getOrganizationIdBySlug(client, slug);
  if (bySlug) {
    console.log(`demo:reset target: slug "${slug}" → ${bySlug}`);
    return bySlug;
  }
  if (args.includes("--rehearsal") || value("--slug")) return null;
  return process.env.AEGIS_ORGANIZATION_ID?.trim() || null;
}

async function main() {
  assertDemoMode("demo reset");
  const args = process.argv.slice(2);
  const keepPack = args.includes("--keep-pack");
  const client = await getPool().connect();
  try {
    const orgId = await resolveResetOrgId(client, args);
    if (!orgId) {
      console.error(
        `No target org: demo org "${DEMO_BANK_SLUG}" not found. ` +
          "Run demo:up (or db:demo-bank-fixture), or pass --org <organization_uuid>.",
      );
      process.exit(1);
    }
    // Append-only triggers (forensic_receipt / sealed event) refuse DELETE.
    // Demo reset is non-production only (see resetDemoOrganization).
    await resetDemoOrganization(client, orgId, { keepPack });
    console.log(
      `Demo reset complete for org ${orgId}${keepPack ? " (pack kept)" : ""}`,
    );
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
