import { getPool } from "../db/pool.js";
import { isFreeWebmailDomain } from "../dlp/placeholder-hints.js";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { domains: string[]; at: number }>();

/**
 * The organization's own email domains, learned from its members' sign-in
 * addresses. Webmail domains are excluded: one member signing in with Gmail
 * does not make Gmail the bank's domain.
 */
export async function getOrgEmailDomains(tenantId: string): Promise<string[]> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.domains;
  }
  const rows = await getPool().query<{ domain: string }>(
    `SELECT DISTINCT lower(split_part(external_id, '@', 2)) AS domain
     FROM stoa_user
     WHERE tenant_id = $1 AND position('@' in external_id) > 1`,
    [tenantId],
  );
  const domains = rows.rows
    .map((r) => r.domain)
    .filter((d) => d.includes(".") && !isFreeWebmailDomain(d));
  cache.set(tenantId, { domains, at: Date.now() });
  return domains;
}
