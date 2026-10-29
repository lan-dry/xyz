import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

import { clearStalePilotOrgEnv } from "./pilot-env.mts";

/** Staff Ops home org (bootstrap). Not the customer pilot demo org. */
export const DEFAULT_PLATFORM_ORG_SLUG = "salanor-platform";

/** Local pilot / demo org created by `pnpm db:local:pilot-fixture`. */
export const DEFAULT_PILOT_ORG_SLUG = "northwind-payments";

/** Resolve org UUID from DATABASE_URL: Northwind (or PILOT_ORGANIZATION_SLUG), else sole org in DB. */
export async function resolveOrganizationId(
  slug = process.env.PILOT_ORGANIZATION_SLUG?.trim() ||
    process.env.DEMO_ORGANIZATION_SLUG?.trim() ||
    DEFAULT_PILOT_ORG_SLUG,
): Promise<string> {
  clearStalePilotOrgEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      `Set DATABASE_URL in repo root .env (see .env.example). Pilot tools pick your org from Postgres automatically.`,
    );
  }

  const pool = new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(databaseUrl),
    max: 1,
  });
  try {
    const bySlug = await pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM organization WHERE slug = $1`,
      [slug],
    );
    const slugId = bySlug.rows[0]?.organization_id;
    if (slugId) {
      return slugId;
    }

    const all = await pool.query<{ organization_id: string; slug: string }>(
      `SELECT organization_id, slug FROM organization ORDER BY created_at ASC`,
    );
    if (all.rows.length === 1) {
      return all.rows[0].organization_id;
    }
    if (all.rows.length === 0) {
      throw new Error(
        `No organizations in database. Run pnpm db:seed:bootstrap (and pnpm db:local:pilot-fixture for the demo agent).`,
      );
    }

    const slugs = all.rows.map((r) => r.slug).join(", ");
    throw new Error(
      `No organization with slug "${slug}". Multiple orgs in DB (${slugs}). Run pnpm db:local:pilot-fixture or set PILOT_ORGANIZATION_SLUG.`,
    );
  } finally {
    await pool.end();
  }
}

/** Slug for an organization id (for logging / console URLs). */
export async function resolveOrganizationSlug(organizationId: string): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return DEFAULT_PLATFORM_ORG_SLUG;
  }
  const pool = new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(databaseUrl),
    max: 1,
  });
  try {
    const result = await pool.query<{ slug: string }>(
      `SELECT slug FROM organization WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows[0]?.slug ?? DEFAULT_PLATFORM_ORG_SLUG;
  } finally {
    await pool.end();
  }
}
