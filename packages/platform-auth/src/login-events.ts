import type pg from "pg";

export type LoginMethod = "password" | "google" | "github" | "sso";

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.")) {
    return true;
  }
  return false;
}

/** Best-effort city/country from IP (not forensic-grade). */
export async function resolveIpGeoLocation(ip: string | null | undefined): Promise<string | null> {
  const trimmed = ip?.trim();
  if (!trimmed) return null;
  if (isPrivateIp(trimmed)) return "Local network";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      city?: string;
      country?: string;
    };
    if (data.success === false) return null;
    const city = data.city?.trim();
    const country = data.country?.trim();
    if (city && country) return `${city}, ${country}`;
    return country ?? city ?? null;
  } catch {
    return null;
  }
}

export async function recordAccountLoginEvent(
  client: pg.Pool | pg.PoolClient,
  input: {
    accountId: string;
    organizationId?: string | null;
    method: LoginMethod;
    success: boolean;
    failureReason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    geoLocation?: string | null;
  },
): Promise<void> {
  const geo =
    input.geoLocation !== undefined
      ? input.geoLocation
      : await resolveIpGeoLocation(input.ipAddress);

  await client.query(
    `INSERT INTO account_login_event (
       account_id, organization_id, method, success, failure_reason,
       ip_address, user_agent, geo_location
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.accountId,
      input.organizationId ?? null,
      input.method,
      input.success,
      input.failureReason ?? null,
      input.ipAddress?.trim() || null,
      input.userAgent?.trim()?.slice(0, 512) || null,
      geo?.trim() || null,
    ],
  );
}

export type AccountLoginEventRow = {
  event_id: string;
  method: LoginMethod;
  success: boolean;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  geo_location: string | null;
  created_at: Date;
};

export async function listAccountLoginEvents(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  limit = 30,
): Promise<AccountLoginEventRow[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const result = await client.query<AccountLoginEventRow>(
    `SELECT event_id, method, success, failure_reason, ip_address, user_agent,
            geo_location, created_at
     FROM account_login_event
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [accountId, capped],
  );
  return result.rows;
}

/** Best-effort label for security UI (not forensic-grade). */
export function describeUserAgent(userAgent: string | null): string | null {
  if (!userAgent?.trim()) return null;
  const ua = userAgent;
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}
