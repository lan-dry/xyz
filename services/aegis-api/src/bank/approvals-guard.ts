/**
 * Approval-time guards: role level, separation of duties, required fields.
 */

import { roleSatisfies, type BankRole } from "./authority-matrix.js";

export type ApprovalAttempt = {
  actor_membership_id: string;
  actor_email: string;
  actor_roles: string[];
  is_requester: boolean;
  /**
   * When true (default), requester cannot approve/release their own case.
   * Set false only via metadata.separation_of_duties === false.
   */
  separation_of_duties?: boolean;
  action: "approve" | "reject" | "release";
  reason_code?: string | null;
  comment?: string | null;
  callback_verified?: boolean | null;
  required_role?: string | null;
  required_fields?: string[];
  hard_stop?: boolean;
  release_requires_role?: string;
};

export type ApprovalGuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function checkApprovalAttempt(
  ladder: BankRole[],
  attempt: ApprovalAttempt,
): ApprovalGuardResult {
  if (attempt.hard_stop && attempt.action === "approve") {
    return {
      ok: false,
      code: "hard_stop",
      message: "Hard stop cannot be approved; a documented release is required",
    };
  }

  if (attempt.action === "release") {
    const need = attempt.release_requires_role ?? "head_of_compliance";
    const ok = attempt.actor_roles.some((r) => roleSatisfies(ladder, r, need));
    if (!ok) {
      return {
        ok: false,
        code: "insufficient_role",
        message: `Release requires ${need} or above`,
      };
    }
    if (!attempt.reason_code?.trim()) {
      return {
        ok: false,
        code: "reason_required",
        message: "Documented reason code required for release",
      };
    }
    return { ok: true };
  }

  const sodOn = attempt.separation_of_duties !== false;
  if (sodOn && attempt.is_requester && attempt.action === "approve") {
    return {
      ok: false,
      code: "separation_of_duties",
      message: "Requester cannot approve their own case",
    };
  }

  if (attempt.required_role) {
    const ok = attempt.actor_roles.some((r) =>
      roleSatisfies(ladder, r, attempt.required_role!),
    );
    if (!ok) {
      return {
        ok: false,
        code: "insufficient_role",
        message: `Requires ${attempt.required_role} or above`,
      };
    }
  }

  const fields = attempt.required_fields ?? [];
  for (const field of fields) {
    if (field === "reason_code" && !attempt.reason_code?.trim()) {
      return {
        ok: false,
        code: "reason_required",
        message: "reason_code is required",
      };
    }
    if (field === "comment" && !attempt.comment?.trim()) {
      return {
        ok: false,
        code: "comment_required",
        message: "comment is required",
      };
    }
    if (field === "callback_verified") {
      if (attempt.action === "approve" && attempt.callback_verified !== true) {
        return {
          ok: false,
          code: "callback_required",
          message: "callback_verified must be true to approve",
        };
      }
    }
  }

  return { ok: true };
}
