/**
 * Access log entries for opening a receipt, downloading evidence or opening a
 * share link. These land in audit_log (the console "Access log" page), with the
 * case id in metadata so the page can filter by case.
 *
 * Writes never fail the request: reading a receipt must not break because the
 * log is unavailable. Repeated opens of the same item by the same person within
 * a short window collapse into one entry (a page refetch is not a new access).
 */

import type pg from "pg";
import { writeAuditEvent } from "@salanor/platform-auth";

export const RECEIPT_ACCESS_ACTIONS = {
  viewed: "receipt.viewed",
  verified: "receipt.verified",
  evidenceDownloaded: "evidence.downloaded",
  shareOpened: "receipt.share_opened",
} as const;

export type ReceiptAccessAction =
  (typeof RECEIPT_ACCESS_ACTIONS)[keyof typeof RECEIPT_ACCESS_ACTIONS];

const DEDUPE_SECONDS = 60;

export function caseIdFromPayload(payload: unknown): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const v = (payload as Record<string, unknown>).case_id;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export type ReceiptAccessActor = {
  organizationId: string;
  membershipId: string | null;
  email: string | null;
};

async function loggedRecently(
  client: pg.Pool | pg.PoolClient,
  actor: ReceiptAccessActor,
  input: { action: string; resourceId: string },
): Promise<boolean> {
  const recent = await client.query(
    `SELECT 1 FROM audit_log
     WHERE organization_id = $1
       AND user_id IS NOT DISTINCT FROM $2
       AND action = $3
       AND resource_id = $4
       AND created_at > now() - ($5 || ' seconds')::interval
     LIMIT 1`,
    [
      actor.organizationId,
      actor.membershipId,
      input.action,
      input.resourceId,
      String(DEDUPE_SECONDS),
    ],
  );
  return (recent.rows?.length ?? recent.rowCount ?? 0) > 0;
}

export async function auditReceiptAccess(
  client: pg.Pool | pg.PoolClient,
  actor: ReceiptAccessActor,
  input: {
    action: ReceiptAccessAction;
    /** event_id, trace_id or share_id that was opened */
    resourceId: string;
    resourceType?: string;
    metadata?: Record<string, unknown>;
    /** Default true. Downloads are deliberate acts: pass false to log each one. */
    dedupe?: boolean;
  },
): Promise<"written" | "deduped" | "failed"> {
  try {
    if (input.dedupe !== false && (await loggedRecently(client, actor, input))) {
      return "deduped";
    }

    const metadata: Record<string, unknown> = { ...input.metadata };
    if (actor.email) metadata.actor_email = actor.email;
    await writeAuditEvent(client, {
      organizationId: actor.organizationId,
      membershipId: actor.membershipId,
      action: input.action,
      resourceType: input.resourceType ?? "receipt",
      resourceId: input.resourceId,
      metadata,
    });
    return "written";
  } catch (err) {
    console.error(
      "[receipt-access] audit write failed",
      err instanceof Error ? err.message : err,
    );
    return "failed";
  }
}
