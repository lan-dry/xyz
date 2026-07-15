import type pg from "pg";

export type LoginMethod = "password" | "google" | "github" | "sso";

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
  },
): Promise<void> {
  await client.query(
    `INSERT INTO account_login_event (
       account_id, organization_id, method, success, failure_reason, ip_address, user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.accountId,
      input.organizationId ?? null,
      input.method,
      input.success,
      input.failureReason ?? null,
      input.ipAddress?.trim() || null,
      input.userAgent?.trim()?.slice(0, 512) || null,
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
  created_at: Date;
};

export async function listAccountLoginEvents(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  limit = 30,
): Promise<AccountLoginEventRow[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const result = await client.query<AccountLoginEventRow>(
    `SELECT event_id, method, success, failure_reason, ip_address, user_agent, created_at
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
