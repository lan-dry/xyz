import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { getMembershipForAccountOrg } from "./identity.js";
import { isPlatformRole, type PlatformRole } from "./platform-roles.js";

export const SALANOR_SESSION_COOKIE = "salanor_session";

export type ConsoleImpersonation = {
  impersonatorAccountId: string;
  impersonatorEmail: string;
  impersonatorPlatformRole: PlatformRole | null;
  startedAt: string;
};

export type ConsoleSession = {
  sessionId: string;
  accountId: string;
  /** Membership id (legacy API field: user_id). */
  userId: string;
  organizationId: string;
  email: string;
  displayName: string | null;
  role: string;
  impersonation?: ConsoleImpersonation;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export type SessionRow = {
  session_id: string;
  account_id: string;
  membership_id: string;
  organization_id: string;
  email: string;
  display_name: string | null;
  role: string;
  impersonator_account_id: string | null;
  parent_session_id: string | null;
  impersonation_started_at: Date | null;
  impersonator_email: string | null;
  impersonator_platform_role: string | null;
};

function mapImpersonation(row: {
  impersonator_account_id: string | null;
  impersonation_started_at: Date | null;
  impersonator_email: string | null;
  impersonator_platform_role: string | null;
}): ConsoleImpersonation | undefined {
  if (!row.impersonator_account_id || !row.impersonation_started_at) {
    return undefined;
  }
  const role = row.impersonator_platform_role;
  return {
    impersonatorAccountId: row.impersonator_account_id,
    impersonatorEmail: row.impersonator_email ?? "",
    impersonatorPlatformRole: isPlatformRole(role) ? role : null,
    startedAt: row.impersonation_started_at.toISOString(),
  };
}

export function mapSessionFromRow(row: SessionRow): ConsoleSession {
  return {
    sessionId: row.session_id,
    accountId: row.account_id,
    userId: row.membership_id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    impersonation: mapImpersonation(row),
  };
}

export async function resolveSessionRow(
  client: pg.Pool | pg.PoolClient,
  token: string,
): Promise<SessionRow | null> {
  const tokenHash = hashSessionToken(token);
  const result = await client.query<SessionRow>(
    `SELECT s.session_id, s.account_id, s.membership_id, s.organization_id,
            a.email, a.display_name, m.role,
            s.impersonator_account_id, s.parent_session_id, s.impersonation_started_at,
            ia.email AS impersonator_email, ia.platform_role AS impersonator_platform_role
     FROM session s
     JOIN membership m ON m.membership_id = s.membership_id
     JOIN account a ON a.account_id = s.account_id
     LEFT JOIN account ia ON ia.account_id = s.impersonator_account_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND m.status = 'active'
       AND a.active = true`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function createSession(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
  organizationId: string,
): Promise<{ token: string; session: ConsoleSession }> {
  const membership = await getMembershipForAccountOrg(client, accountId, organizationId);
  if (!membership) {
    throw new Error("No active membership for organization");
  }

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const inserted = await client.query<{ session_id: string }>(
    `INSERT INTO session (account_id, membership_id, organization_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING session_id`,
    [accountId, membership.membership_id, organizationId, tokenHash, expiresAt],
  );

  await client.query(
    `UPDATE membership SET last_active_at = now() WHERE membership_id = $1`,
    [membership.membership_id],
  );

  const sessionId = inserted.rows[0]!.session_id;
  return {
    token,
    session: {
      sessionId,
      accountId,
      userId: membership.membership_id,
      organizationId,
      email: membership.email,
      displayName: membership.display_name,
      role: membership.role,
    },
  };
}

export async function switchSessionOrganization(
  client: pg.Pool | pg.PoolClient,
  token: string,
  organizationId: string,
): Promise<ConsoleSession | null> {
  const tokenHash = hashSessionToken(token);
  const current = await client.query<{
    session_id: string;
    account_id: string;
  }>(
    `SELECT session_id, account_id FROM session
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  const row = current.rows[0];
  if (!row) {
    return null;
  }

  const membership = await getMembershipForAccountOrg(
    client,
    row.account_id,
    organizationId,
  );
  if (!membership) {
    return null;
  }

  await client.query(
    `UPDATE session
     SET organization_id = $1, membership_id = $2
     WHERE session_id = $3`,
    [organizationId, membership.membership_id, row.session_id],
  );

  await client.query(
    `UPDATE membership SET last_active_at = now() WHERE membership_id = $1`,
    [membership.membership_id],
  );

  return {
    sessionId: row.session_id,
    accountId: row.account_id,
    userId: membership.membership_id,
    organizationId,
    email: membership.email,
    displayName: membership.display_name,
    role: membership.role,
  };
}

export async function resolveSession(
  client: pg.Pool | pg.PoolClient,
  token: string,
): Promise<ConsoleSession | null> {
  const row = await resolveSessionRow(client, token);
  if (!row) {
    return null;
  }
  return mapSessionFromRow(row);
}

export async function deleteSession(
  client: pg.Pool | pg.PoolClient,
  token: string,
): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await client.query(`DELETE FROM session WHERE token_hash = $1`, [tokenHash]);
}

/** Validate session via Salanor ID HTTP API (product services use this in production). */
export async function resolveSessionViaId(
  idBaseUrl: string,
  token: string,
): Promise<ConsoleSession | null> {
  const url = `${idBaseUrl.replace(/\/$/, "")}/v1/id/auth/validate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { session?: ConsoleSession };
  return body.session ?? null;
}
