import { getPool } from "../db/pool.js";
import { getIdentityPool, identityConfigured } from "../identity/pool.js";

/**
 * When a site is linked to a directory group (SCIM externalId), assign the
 * Stoa user on sign-in. Org-wide policy stays on the tenant; sites are for
 * reporting and delegation, not separate DLP profiles.
 */
export async function syncUserSiteFromDirectory(input: {
  tenantId: string;
  stoaUserId: string;
  platformOrganizationId: string;
  platformAccountId: string;
}): Promise<void> {
  if (!identityConfigured()) {
    return;
  }
  const groups = await getIdentityPool().query<{ external_id: string | null }>(
    `SELECT g.external_id
     FROM organization_scim_group_member gm
     JOIN organization_scim_group g ON g.scim_group_id = gm.scim_group_id
     JOIN membership m ON m.membership_id = gm.membership_id
     WHERE m.organization_id = $1 AND m.account_id = $2`,
    [input.platformOrganizationId, input.platformAccountId],
  );
  const externalIds = groups.rows
    .map((r) => r.external_id?.trim())
    .filter((id): id is string => Boolean(id));
  if (externalIds.length === 0) {
    return;
  }

  const site = await getPool().query<{ id: string }>(
    `SELECT id FROM stoa_site
     WHERE tenant_id = $1
       AND directory_group_external_id = ANY($2::text[])
     ORDER BY name
     LIMIT 1`,
    [input.tenantId, externalIds],
  );
  const siteId = site.rows[0]?.id;
  if (!siteId) {
    return;
  }

  await getPool().query(
    `UPDATE stoa_user SET site_id = $3
     WHERE id = $1 AND tenant_id = $2`,
    [input.stoaUserId, input.tenantId, siteId],
  );
}
