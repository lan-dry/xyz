import type pg from "pg";

export const PLATFORM_ORG_SLUG = "salanor-platform";

export async function getOrganizationIdBySlug(
  client: pg.Pool | pg.PoolClient,
  slug: string,
): Promise<string | null> {
  const result = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1`,
    [slug],
  );
  return result.rows[0]?.organization_id ?? null;
}

/** Demo CLIs: bootstrap org unless DEMO_ORGANIZATION_ID is set. */
export async function resolveDemoOrganizationId(
  client: pg.Pool | pg.PoolClient,
): Promise<string> {
  const fromEnv = process.env.DEMO_ORGANIZATION_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const slug =
    process.env.DEMO_ORGANIZATION_SLUG?.trim() || PLATFORM_ORG_SLUG;
  const id = await getOrganizationIdBySlug(client, slug);
  if (!id) {
    throw new Error(
      `No organization slug "${slug}". Run db:seed:bootstrap and db:local:pilot-fixture.`,
    );
  }
  return id;
}
