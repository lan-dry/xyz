/**
 * Approver notifications on hold (P3).
 * Content must not include sensitive field values.
 * Links never approve — login required.
 */

import { createHash } from "node:crypto";
import type pg from "pg";

export type NotificationChannel = "email" | "webhook";

export type NotificationPayload = {
  case_id: string;
  outcome: "hold";
  required_roles: string[];
  /** Safe summary only — no PII / national IDs / clear attributes. */
  summary: string;
  approval_url?: string;
};

export type DeliveryAttempt = {
  channel: NotificationChannel;
  target: string;
  status: "queued" | "sent" | "failed";
  attempt: number;
  error?: string;
  at: string;
};

const deliveryLog: DeliveryAttempt[] = [];

export function getNotificationDeliveryLog(): DeliveryAttempt[] {
  return [...deliveryLog];
}

export function clearNotificationDeliveryLog(): void {
  deliveryLog.length = 0;
}

function safeSummary(input: {
  case_id: string;
  required_roles: string[];
  rule_ids: string[];
}): string {
  return `Case ${input.case_id} is held. Roles: ${input.required_roles.join(", ") || "none"}. Rules: ${input.rule_ids.join(", ") || "none"}.`;
}

export function buildHoldNotification(input: {
  case_id: string;
  required_roles: string[];
  rule_ids: string[];
  console_base_url?: string;
}): NotificationPayload {
  const summary = safeSummary(input);
  // Guard: never embed raw attribute values
  if (/national_id|ssn|password/i.test(summary)) {
    throw new Error("notification_content_unsafe");
  }
  return {
    case_id: input.case_id,
    outcome: "hold",
    required_roles: input.required_roles,
    summary,
    approval_url: input.console_base_url
      ? `${input.console_base_url.replace(/\/$/, "")}/approvals?case=${encodeURIComponent(input.case_id)}`
      : undefined,
  };
}

export async function deliverHoldNotification(
  payload: NotificationPayload,
  targets: Array<{ channel: NotificationChannel; target: string }>,
  options?: { maxAttempts?: number; send?: (t: { channel: NotificationChannel; target: string; body: string }) => Promise<void> },
): Promise<DeliveryAttempt[]> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const attempts: DeliveryAttempt[] = [];
  const body = JSON.stringify({
    type: "aegis.hold",
    case_id: payload.case_id,
    summary: payload.summary,
    required_roles: payload.required_roles,
    approval_url: payload.approval_url,
    note: "This link does not approve. Sign in to act.",
  });

  for (const t of targets) {
    let lastError: string | undefined;
    let status: DeliveryAttempt["status"] = "failed";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (options?.send) {
          await options.send({ ...t, body });
        }
        // default: record as sent (demo / unit); real SMTP/webhook wired by caller
        status = "sent";
        lastError = undefined;
        const row: DeliveryAttempt = {
          channel: t.channel,
          target: hashTarget(t.target),
          status,
          attempt,
          at: new Date().toISOString(),
        };
        attempts.push(row);
        deliveryLog.push(row);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "send_failed";
        const row: DeliveryAttempt = {
          channel: t.channel,
          target: hashTarget(t.target),
          status: "failed",
          attempt,
          error: lastError,
          at: new Date().toISOString(),
        };
        attempts.push(row);
        deliveryLog.push(row);
        await new Promise((r) => setTimeout(r, Math.min(1000, 50 * 2 ** (attempt - 1))));
      }
    }
    if (status === "failed" && lastError) {
      // exhausted
    }
  }
  return attempts;
}

function hashTarget(target: string): string {
  return `sha256:${createHash("sha256").update(target, "utf8").digest("hex").slice(0, 16)}`;
}

/** Persist delivery rows when the table exists (best-effort). */
export async function persistDeliveryLog(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  caseId: string,
  attempts: DeliveryAttempt[],
): Promise<void> {
  for (const a of attempts) {
    try {
      await client.query(
        `INSERT INTO audit_log (organization_id, action, resource_type, resource_id, metadata)
         VALUES ($1, 'notification.delivery', 'bank_case', $2, $3::jsonb)`,
        [organizationId, caseId, JSON.stringify(a)],
      );
    } catch {
      // table / schema may vary
    }
  }
}
