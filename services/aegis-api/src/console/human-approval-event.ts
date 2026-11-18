import { type ApsEvent } from "@salanor/aegis";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { signApsEventWithKey } from "../crypto/signing-provider.js";
import { persistSignedEvent, type PersistResult } from "../ingest/persist.js";
import { getSigningKeyMaterial } from "../repo/signing-keys.js";
import type { DelegationRecord } from "../bank/approval-delegate.js";

async function withClient<T>(
  client: pg.Pool | pg.PoolClient,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  // PoolClient also has `.connect` (already-connected clients throw if called again),
  // so detect an in-hand client via `.release` instead of `"connect" in client`.
  if ("release" in client && typeof client.release === "function") {
    return fn(client);
  }
  const conn = await (client as pg.Pool).connect();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

export type HumanApprovalDecision = "approved" | "rejected" | "released";

export async function ingestHumanApprovalEvent(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    traceId: string;
    agentId: string;
    keyId: string;
    parentEventId: string;
    approverEmail: string;
    approverUserId: string;
    approverDisplayName?: string | null;
    approverRole?: string | null;
    approvalId: string;
    decision: HumanApprovalDecision;
    toolName?: string;
    reason?: string;
    reasonCode?: string;
    requesterEmail?: string | null;
    requesterOfficerId?: string | null;
    /** Time-bound delegation relied on: both people are named in the signed event. */
    delegation?: DelegationRecord | null;
    /** Historical emit time (demo seed). Defaults to now. */
    emitted_at?: string;
  },
): Promise<PersistResult> {
  const keyMaterial = await getSigningKeyMaterial(client, params.organizationId, params.keyId);
  if (!keyMaterial) {
    throw new Error(`Signing key ${params.keyId} not found`);
  }

  const policyDecision =
    params.decision === "rejected" ? "deny" : "allow";

  const event: ApsEvent = {
    schema_version: 1,
    event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    organization_id: params.organizationId,
    trace_id: params.traceId,
    agent_id: params.agentId,
    key_id: params.keyId,
    emitted_at: params.emitted_at?.trim() || new Date().toISOString(),
    actor_type: "human",
    actor_principal: params.approverEmail,
    action_kind: "human_approval",
    policy_decision: policyDecision,
    tool_name: params.toolName ?? "aegis.approval.decision",
    parent_event_id: params.parentEventId,
    payload: {
      approval_id: params.approvalId,
      decision: params.decision,
      tool_name: params.toolName,
      approver_email: params.approverEmail,
      approver_user_id: params.approverUserId,
      ...(params.approverDisplayName
        ? { approver_display_name: params.approverDisplayName }
        : {}),
      ...(params.approverRole ? { approver_role: params.approverRole } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
      ...(params.reasonCode ? { reason_code: params.reasonCode } : {}),
      ...(params.requesterEmail ? { requester_email: params.requesterEmail } : {}),
      ...(params.requesterOfficerId
        ? { requester_officer_id: params.requesterOfficerId }
        : {}),
      ...(params.delegation
        ? {
            acting_under_delegation: {
              delegate_id: params.delegation.delegate_id,
              role_key: params.delegation.role_key,
              expires_at: params.delegation.expires_at,
              acted_by: params.delegation.delegate,
              delegated_by: params.delegation.delegator,
            },
          }
        : {}),
      investor_summary: (() => {
        // Never surface engine tool ids (e.g. governed.action) in user-facing text (A4).
        const tool = params.toolName?.trim();
        const what =
          !tool || tool === "governed.action" || tool === "policy_decision"
            ? "the held action"
            : tool;
        if (params.decision === "approved") return `Human approved ${what}`;
        if (params.decision === "released") return `Human released ${what}`;
        return `Human declined ${what}`;
      })(),
    },
  };

  const signed = await signApsEventWithKey(event, keyMaterial);
  return withClient(client, async (conn) => persistSignedEvent(conn, signed, undefined));
}
