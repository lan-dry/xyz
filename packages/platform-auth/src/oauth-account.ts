import { randomUUID } from "node:crypto";
import type pg from "pg";
import { provisionOrganization, RegisterError } from "./identity.js";
import { organizationNeedsOnboarding } from "./onboarding.js";

export type OAuthProvider = "google" | "github";

export type OAuthLoginResult = {
  accountId: string;
  organizationId: string;
  needsOnboarding?: boolean;
};

/** OAuth cannot link to an existing password signup until that email is verified. */
export class OAuthLoginError extends Error {
  constructor(
    readonly code: "pending_email_verification" | "no_membership",
    message: string,
  ) {
    super(message);
    this.name = "OAuthLoginError";
  }
}

export async function linkOAuthIdentity(
  client: pg.Pool | pg.PoolClient,
  input: {
    provider: OAuthProvider;
    providerSubject: string;
    accountId: string;
    email: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO account_oauth (provider, provider_subject, account_id, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_subject) DO UPDATE
       SET account_id = EXCLUDED.account_id,
           email = EXCLUDED.email`,
    [input.provider, input.providerSubject, input.accountId, input.email.toLowerCase()],
  );
}

export async function findAccountIdByOAuth(
  client: pg.Pool | pg.PoolClient,
  provider: OAuthProvider,
  providerSubject: string,
): Promise<string | null> {
  const result = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account_oauth
     WHERE provider = $1 AND provider_subject = $2`,
    [provider, providerSubject],
  );
  return result.rows[0]?.account_id ?? null;
}

/**
 * Self-serve: first sign-in via Google/GitHub creates org + account (IdP-verified email).
 */
export async function registerSelfServeViaOAuth(
  client: pg.Pool | pg.PoolClient,
  input: {
    provider: OAuthProvider;
    providerSubject: string;
    email: string;
    displayName?: string | null;
    organizationName?: string;
  },
): Promise<OAuthLoginResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account WHERE lower(email) = $1 AND active = true`,
    [email],
  );
  let accountId = existing.rows[0]?.account_id;

  if (accountId) {
    const memberships = await client.query(
      `SELECT 1 FROM membership WHERE account_id = $1 AND status = 'active' LIMIT 1`,
      [accountId],
    );
    if (memberships.rows[0]) {
      throw new RegisterError("email_taken", "An account with this email already exists");
    }
  }

  const organizationName = input.organizationName?.trim() || "Your organization";
  const slug = `pending-${randomUUID().slice(0, 8)}`;

  const result = await provisionOrganization(client, {
    name: organizationName,
    slug,
    adminEmail: email,
    adminDisplayName: input.displayName ?? null,
    adminPasswordHash: null,
    plan: "free",
    deferOnboarding: !input.organizationName?.trim(),
  });

  accountId = result.account_id;

  await linkOAuthIdentity(client, {
    provider: input.provider,
    providerSubject: input.providerSubject,
    accountId,
    email,
  });

  await client.query(
    `UPDATE account SET email_verified_at = now(), updated_at = now() WHERE account_id = $1`,
    [accountId],
  );

  const needsOnboarding = await organizationNeedsOnboarding(
    client,
    result.organization_id,
  );

  return {
    accountId,
    organizationId: result.organization_id,
    needsOnboarding,
  };
}

/**
 * Sign in via OAuth: match by provider id or email, optionally create account when allowed.
 */
export async function resolveOrCreateOAuthLogin(
  client: pg.Pool | pg.PoolClient,
  input: {
    provider: OAuthProvider;
    providerSubject: string;
    email: string;
    displayName?: string | null;
  },
  options: { allowSignup: boolean },
): Promise<OAuthLoginResult | null> {
  const existing = await resolveOAuthLogin(client, input);
  if (existing) {
    return existing;
  }
  if (!options.allowSignup) {
    return null;
  }

  const email = input.email.trim().toLowerCase();
  const pending = await client.query<{ account_id: string }>(
    `SELECT account_id FROM account
     WHERE lower(email) = $1 AND active = true AND email_verified_at IS NULL`,
    [email],
  );
  if (pending.rows[0]) {
    throw new OAuthLoginError(
      "pending_email_verification",
      "Verify your email before signing in with Google or GitHub.",
    );
  }

  return registerSelfServeViaOAuth(client, input);
}

/**
 * Resolve console login from OAuth profile. Links provider to an existing account by email when found.
 */
export async function resolveOAuthLogin(
  client: pg.Pool | pg.PoolClient,
  input: {
    provider: OAuthProvider;
    providerSubject: string;
    email: string;
    displayName?: string | null;
  },
): Promise<OAuthLoginResult | null> {
  const email = input.email.trim().toLowerCase();
  if (!email) return null;

  const linkedAccountId = await findAccountIdByOAuth(
    client,
    input.provider,
    input.providerSubject,
  );
  let accountId = linkedAccountId;

  if (!accountId) {
    const byEmail = await client.query<{
      account_id: string;
      email_verified_at: Date | null;
    }>(
      `SELECT account_id, email_verified_at FROM account
       WHERE lower(email) = $1 AND active = true`,
      [email],
    );
    const row = byEmail.rows[0];
    if (row) {
      if (!row.email_verified_at) {
        throw new OAuthLoginError(
          "pending_email_verification",
          "Verify your email before signing in with Google or GitHub.",
        );
      }
      accountId = row.account_id;
    }
  }

  if (!accountId) {
    return null;
  }

  await linkOAuthIdentity(client, {
    provider: input.provider,
    providerSubject: input.providerSubject,
    accountId,
    email,
  });

  if (input.displayName?.trim()) {
    await client.query(
      `UPDATE account SET display_name = COALESCE(display_name, $1), updated_at = now()
       WHERE account_id = $2`,
      [input.displayName.trim(), accountId],
    );
  }

  await client.query(
    `UPDATE account SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
     WHERE account_id = $1`,
    [accountId],
  );

  const memberships = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY last_active_at DESC NULLS LAST, joined_at ASC`,
    [accountId],
  );
  const membership = memberships.rows[0];
  if (!membership) {
    return null;
  }

  const needsOnboarding = await organizationNeedsOnboarding(
    client,
    membership.organization_id,
  );

  return {
    accountId,
    organizationId: membership.organization_id,
    needsOnboarding: needsOnboarding || undefined,
  };
}
