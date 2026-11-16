/**
 * Configured escalation: an approval whose metadata carries `escalate_after_ms` +
 * `escalate_to_role` (copied from the rule's obligations when the approval was
 * requested) is raised to that role once the window has elapsed. This reads real
 * elapsed time (created_at vs now()); it never uses the demo clock.
 */
import type pg from "pg";
import { applyEscalateToRoleMetadata } from "./console-approval-guard.js";

export const ESCALATION_ACTOR = {
  membership_id: "system",
  email: "system@aegis",
} as const;

/** Pure: has this approval's configured window elapsed and not yet escalated? */
export function isEscalationDue(
  metadata: Record<string, unknown> | null | undefined,
  createdAt: Date,
  now: Date = new Date(),
): boolean {
  if (!metadata) return false;
  const after = Number(metadata.escalate_after_ms);
  const to = metadata.escalate_to_role;
  if (!Number.isFinite(after) || after <= 0) return false;
  if (typeof to !== "string" || !to.trim()) return false;
  if (typeof metadata.escalated_to_role_at === "string") return false;
  return now.getTime() - createdAt.getTime() >= after;
}

/** Escalate every due pending approval for an org. Returns the escalated approval ids. */
export async function escalateDueApprovals(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const candidates = await client.query<{
    approval_id: string;
    created_at: Date;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT approval_id, created_at, metadata
       FROM approval
      WHERE organization_id = $1
        AND status IN ('pending', 'needs_info')
        AND metadata ? 'escalate_after_ms'
        AND COALESCE(metadata->>'escalated_to_role_at', '') = ''`,
    [organizationId],
  );
  const escalated: string[] = [];
  for (const row of candidates.rows) {
    if (!isEscalationDue(row.metadata, row.created_at, now)) continue;
    const next = applyEscalateToRoleMetadata(
      row.metadata,
      String(row.metadata!.escalate_to_role),
      ESCALATION_ACTOR,
    );
    next.escalated_reason = "no_decision_within_configured_window";
    const updated = await client.query(
      `UPDATE approval SET metadata = $3::jsonb
        WHERE organization_id = $1 AND approval_id = $2
          AND status IN ('pending', 'needs_info')
          AND COALESCE(metadata->>'escalated_to_role_at', '') = ''`,
      [organizationId, row.approval_id, JSON.stringify(next)],
    );
    if ((updated.rowCount ?? 0) === 0) continue;
    await client.query(
      `INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, NULL, 'approval.escalated', 'approval', $2, $3::jsonb)`,
      [
        organizationId,
        row.approval_id,
        JSON.stringify({
          to_role: next.escalate_to_role,
          after_ms: row.metadata?.escalate_after_ms,
        }),
      ],
    );
    escalated.push(row.approval_id);
  }
  return escalated;
}
