import { type ApsEvent } from "@salanor/aegis";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { signApsEventWithKey } from "../crypto/signing-provider.js";
import { persistSignedEvent } from "../ingest/persist.js";
import { getSigningKeyMaterial } from "../repo/signing-keys.js";

async function withClient<T>(
  client: pg.Pool | pg.PoolClient,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if ("connect" in client) {
    const conn = (await (client as pg.Pool).connect()) as pg.PoolClient;
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }
  return fn(client as pg.PoolClient);
}

export async function ingestHumanApprovalEvent(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    traceId: string;
    agentId: string;
    keyId: string;
    parentEventId: string;
    approverEmail: string;
    approvalId: string;
    decision: "approved" | "rejected";
    toolName?: string;
  },
): Promise<string> {
  const keyMaterial = await getSigningKeyMaterial(client, params.organizationId, params.keyId);
  if (!keyMaterial) {
    throw new Error(`Signing key ${params.keyId} not found`);
  }

  const event: ApsEvent = {
    schema_version: 1,
    event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    organization_id: params.organizationId,
    trace_id: params.traceId,
    agent_id: params.agentId,
    key_id: params.keyId,
    emitted_at: new Date().toISOString(),
    actor_type: "human",
    actor_principal: params.approverEmail,
    action_kind: "human_approval",
    policy_decision: params.decision === "approved" ? "allow" : "deny",
    tool_name: params.toolName ?? "aegis.approval.decision",
    parent_event_id: params.parentEventId,
    payload: {
      approval_id: params.approvalId,
      decision: params.decision,
      tool_name: params.toolName,
      approver_email: params.approverEmail,
      investor_summary:
        params.decision === "approved"
          ? `Human approved ${params.toolName ?? "tool call"}`
          : `Human rejected ${params.toolName ?? "tool call"}`,
    },
  };

  const signed = await signApsEventWithKey(event, keyMaterial);
  return withClient(client, async (conn) => {
    const result = await persistSignedEvent(conn, signed, undefined);
    return result.eventId;
  });
}
