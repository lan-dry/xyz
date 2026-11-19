/**
 * Stage 5 — approver binding.
 *
 * Seals what the human saw (canonical request preview hash) and who they were
 * (account / SSO / session / role / step-up MFA) into the approval outcome receipt.
 *
 * WebAuthn: interface only (Partial). Do not wire into login until assertion
 * verification is complete end-to-end.
 */

import type pg from "pg";
import { jcs, sha256Hex } from "@salanor/aegis-sdk";
import {
  buildRequestPreview,
  type RequestPreview,
} from "./request-preview.js";

/** Optional WebAuthn assertion shape for a future step-up path. Not verified yet. */
export type WebAuthnApproverAssertion = {
  credential_id: string;
  client_data_json_b64: string;
  authenticator_data_b64: string;
  signature_b64: string;
  user_handle_b64?: string | null;
};

/**
 * Authenticated identity bound into the signed approval outcome.
 * `webauthn_assertion` stays null until Stage 5 WebAuthn is finished (Partial).
 * `step_up_mfa` is never treated as server-verified MFA — only a client claim.
 */
export type ApproverBinding = {
  account_id: string;
  membership_id: string;
  /** First linked OAuth / SSO subject when present. */
  sso_subject: string | null;
  session_id: string;
  role_key: string | null;
  /** false, or `{ claimed_by_client: true }` when the browser asserted step-up. */
  step_up_mfa: false | { claimed_by_client: true };
  webauthn_assertion: WebAuthnApproverAssertion | null;
};

/** How the approved view hash was confirmed for this vote / outcome. */
export type ViewConfirmation =
  | "confirmed_by_approver"
  | "server-rendered, not confirmed by approver";

/** Stable subset of the console request preview that enters the hash. */
export function canonicalApprovedView(
  preview: RequestPreview,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    fields: preview.fields.map((f) => ({ key: f.key, value: f.value })),
  };
  if (preview.amount_usd !== undefined) out.amount_usd = preview.amount_usd;
  if (preview.summary !== undefined) out.summary = preview.summary;
  return out;
}

/** `sha256:<hex>` of JCS(canonicalApprovedView(preview)). */
export function hashApprovedView(preview: RequestPreview): string {
  return `sha256:${sha256Hex(jcs(canonicalApprovedView(preview)))}`;
}

export function hashApprovedViewFromEventPayload(
  payload: Record<string, unknown> | null | undefined,
): string {
  return hashApprovedView(buildRequestPreview(payload));
}

export function assertApprovedViewFresh(
  currentHash: string,
  clientHash: string | null | undefined,
):
  | { ok: true; viewConfirmation: ViewConfirmation }
  | { ok: false; code: "stale_approval_payload"; message: string } {
  if (clientHash == null || !String(clientHash).trim()) {
    // Slack / legacy callers omit the hash; seal that the server rendered the view.
    return {
      ok: true,
      viewConfirmation: "server-rendered, not confirmed by approver",
    };
  }
  if (String(clientHash).trim() !== currentHash) {
    return {
      ok: false,
      code: "stale_approval_payload",
      message:
        "This approval view is out of date. The underlying request changed since you opened it — refresh and review again.",
    };
  }
  return { ok: true, viewConfirmation: "confirmed_by_approver" };
}

export function buildApproverBinding(input: {
  accountId: string;
  membershipId: string;
  sessionId: string;
  roleKey: string | null;
  ssoSubject?: string | null;
  stepUpMfa?: boolean;
  webauthnAssertion?: WebAuthnApproverAssertion | null;
}): ApproverBinding {
  return {
    account_id: input.accountId,
    membership_id: input.membershipId,
    sso_subject: input.ssoSubject ?? null,
    session_id: input.sessionId,
    role_key: input.roleKey,
    step_up_mfa:
      input.stepUpMfa === true ? { claimed_by_client: true } : false,
    // Partial: never accept an unverified client assertion as bound.
    webauthn_assertion: null,
  };
}

/** Prefer a stable SSO subject when the account has linked OAuth identities. */
export async function loadSsoSubjectForAccount(
  client: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<string | null> {
  try {
    const result = await client.query<{ provider_subject: string }>(
      `SELECT provider_subject
         FROM account_oauth
        WHERE account_id = $1
        ORDER BY provider ASC
        LIMIT 1`,
      [accountId],
    );
    return result.rows[0]?.provider_subject ?? null;
  } catch {
    return null;
  }
}

/**
 * Separation of duties is on unless metadata.separation_of_duties === false.
 * Bank packs leave it unset (on). Tests can turn it off explicitly.
 */
export function separationOfDutiesEnabled(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.separation_of_duties !== false;
}
