/**
 * Console approve/reject wiring for checkApprovalAttempt.
 * Pure builders are unit-tested without a DB; DB load is soft when bank tables are missing.
 */

import type pg from "pg";
import {
  checkApprovalAttempt,
  type ApprovalAttempt,
  type ApprovalGuardResult,
} from "./approvals-guard.js";
import type { BankRole } from "./authority-matrix.js";
import { loadBankApprovalRoleContext } from "./repo.js";
import { getApprovalRich } from "../repo/approvals.js";

export type ApprovalDecisionBody = {
  reason?: string;
  reason_code?: string;
  comment?: string;
  callback_verified?: boolean;
  required_fields?: string[];
  required_role?: string;
  /** Target bank role when escalating (metadata.escalate_to_role). */
  escalate_to_role?: string;
};

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function pickRequiredRole(
  metadata: Record<string, unknown> | null | undefined,
  body: ApprovalDecisionBody,
  bankRolesAvailable: boolean,
): string | null {
  if (!bankRolesAvailable) return null;
  if (typeof body.required_role === "string" && body.required_role.trim()) {
    return body.required_role.trim();
  }
  if (typeof metadata?.required_role === "string" && metadata.required_role.trim()) {
    return metadata.required_role.trim();
  }
  const roles = asStringArray(metadata?.required_roles);
  return roles?.[0] ?? null;
}

function pickRequiredFields(
  metadata: Record<string, unknown> | null | undefined,
  body: ApprovalDecisionBody,
): string[] {
  return (
    asStringArray(body.required_fields) ??
    asStringArray(metadata?.required_fields) ??
    []
  );
}

export function isRequesterFromPayload(
  payload: Record<string, unknown> | null | undefined,
  approverEmail: string | null | undefined,
): boolean {
  if (!approverEmail?.trim() || !payload) return false;
  const candidates = [
    payload.requester_email,
    payload.on_behalf_of_email,
    payload.on_behalf_of,
    payload.actor_email,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());
  return candidates.includes(approverEmail.trim().toLowerCase());
}

/** Build attempt + ladder inputs for checkApprovalAttempt (no DB). */
export function buildConsoleApprovalAttempt(input: {
  actor_membership_id: string;
  actor_email: string;
  actor_roles: string[];
  is_requester: boolean;
  action: "approve" | "reject" | "release";
  metadata?: Record<string, unknown> | null;
  body?: ApprovalDecisionBody;
  bankRolesAvailable: boolean;
  ladder: BankRole[];
}): { attempt: ApprovalAttempt; ladder: BankRole[] } {
  const body = input.body ?? {};
  const metadata = input.metadata ?? null;
  const comment =
    (typeof body.comment === "string" ? body.comment : null) ??
    (typeof body.reason === "string" ? body.reason : null);

  const releaseRequires =
    typeof metadata?.release_requires_role === "string"
      ? metadata.release_requires_role
      : typeof metadata?.escalate_to_role === "string" && input.action === "release"
        ? metadata.escalate_to_role
        : undefined;

  const attempt: ApprovalAttempt = {
    actor_membership_id: input.actor_membership_id,
    actor_email: input.actor_email,
    actor_roles: input.actor_roles,
    is_requester: input.is_requester,
    action: input.action,
    reason_code: typeof body.reason_code === "string" ? body.reason_code : null,
    comment,
    callback_verified:
      typeof body.callback_verified === "boolean" ? body.callback_verified : null,
    required_role: pickRequiredRole(metadata, body, input.bankRolesAvailable),
    required_fields: pickRequiredFields(metadata, body),
    hard_stop: metadata?.hard_stop === true,
    release_requires_role: releaseRequires,
  };

  return { attempt, ladder: input.ladder };
}

export function evaluateConsoleApprovalAttempt(input: {
  actor_membership_id: string;
  actor_email: string;
  actor_roles: string[];
  is_requester: boolean;
  action: "approve" | "reject" | "release";
  metadata?: Record<string, unknown> | null;
  body?: ApprovalDecisionBody;
  bankRolesAvailable: boolean;
  ladder: BankRole[];
}): ApprovalGuardResult {
  const { attempt, ladder } = buildConsoleApprovalAttempt(input);
  const guarded = checkApprovalAttempt(ladder, attempt);
  if (!guarded.ok) return guarded;

  // Preserve four-eyes on decline (checkApprovalAttempt only blocks self-approve).
  if (input.is_requester && input.action === "reject") {
    return {
      ok: false,
      code: "separation_of_duties",
      message:
        "Four-eyes: you cannot approve or decline your own request. Ask another admin.",
    };
  }
  return { ok: true };
}

/** Apply escalate_to_role on pending approval metadata (raises required_role). */
export function applyEscalateToRoleMetadata(
  metadata: Record<string, unknown> | null | undefined,
  escalateToRole: string,
  actor: { membership_id: string; email: string },
): Record<string, unknown> {
  const role = escalateToRole.trim();
  if (!role) {
    throw new Error("escalate_to_role required");
  }
  const next = {
    ...(metadata && typeof metadata === "object" ? metadata : {}),
  };
  next.escalate_to_role = role;
  next.required_role = role;
  next.required_roles = [role];
  next.escalated_to_role_at = new Date().toISOString();
  next.escalated_to_role_by = {
    membership_id: actor.membership_id,
    email: actor.email,
  };
  return next;
}

/**
 * Load approval + bank roles (when tables exist) and run checkApprovalAttempt.
 * Returns ok when the approval row is missing so the route can 404 as before.
 */
export async function guardConsoleApprovalDecision(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    membershipId: string;
    email: string;
    approvalId: string;
    action: "approve" | "reject" | "release";
    body?: ApprovalDecisionBody;
  },
): Promise<ApprovalGuardResult> {
  const rich = await getApprovalRich(
    client,
    params.organizationId,
    params.approvalId,
  );
  if (!rich) return { ok: true };

  const roleCtx = await loadBankApprovalRoleContext(
    client,
    params.organizationId,
    params.membershipId,
  );

  return evaluateConsoleApprovalAttempt({
    actor_membership_id: params.membershipId,
    actor_email: params.email,
    actor_roles: roleCtx.actorRoles,
    is_requester: isRequesterFromPayload(rich.event_payload, params.email),
    action: params.action,
    metadata: rich.metadata ?? null,
    body: params.body,
    bankRolesAvailable: roleCtx.available,
    ladder: roleCtx.ladder,
  });
}
