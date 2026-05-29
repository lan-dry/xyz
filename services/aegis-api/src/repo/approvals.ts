import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";

export type ApprovalRow = {
  approval_id: string;
  event_id: string;
  organization_id: string;
  approver_user_id: string | null;
  channel_type: string;
  status: string;
  expires_at: Date | null;
  decided_at: Date | null;
  created_at: Date;
};

export type ApprovalDetail = ApprovalRow & {
  trace_id: string;
  tool_name: string | null;
  agent_id: string;
};

export type DeferredRequest = {
  url: string;
  method: string;
};

export async function ensureWebUiChannel(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string> {
  const channelId = `ch_web_${organizationId.replace(/-/g, "").slice(0, 12)}`;
  await client.query(
    `INSERT INTO approval_channel (channel_id, organization_id, channel_type, active)
     VALUES ($1, $2, 'web_ui', true)
     ON CONFLICT (channel_id) DO NOTHING`,
    [channelId, organizationId],
  );
  return channelId;
}

export async function createApprovalRequest(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    eventId: string;
    traceId: string;
    toolName: string;
    deferred: DeferredRequest;
  },
): Promise<{ approval_id: string }> {
  await ensureWebUiChannel(client, params.organizationId);

  const approvalId = `apr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const tokenHash = createHash("sha256")
    .update(approvalId, "utf8")
    .digest("hex");

  await client.query(
    `INSERT INTO approval (
       approval_id, event_id, organization_id, channel_type, token_hash, status, expires_at
     ) VALUES ($1, $2, $3, 'web_ui', $4, 'pending', now() + interval '24 hours')`,
    [approvalId, params.eventId, params.organizationId, tokenHash],
  );

  await client.query(
    `UPDATE event
     SET payload = COALESCE(payload, '{}'::jsonb) || $1::jsonb
     WHERE event_id = $2`,
    [
      JSON.stringify({
        deferred_request: params.deferred,
        obligation_tool: params.toolName,
      }),
      params.eventId,
    ],
  );

  await client.query(
    `UPDATE trace SET status = 'blocked'
     WHERE trace_id = $1 AND organization_id = $2`,
    [params.traceId, params.organizationId],
  );

  return { approval_id: approvalId };
}

export async function getApproval(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
): Promise<ApprovalDetail | null> {
  const result = await client.query<ApprovalDetail>(
    `SELECT a.approval_id, a.event_id, a.organization_id, a.approver_user_id,
            a.channel_type, a.status, a.expires_at, a.decided_at, a.created_at,
            e.trace_id, e.tool_name, e.agent_id
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     WHERE a.organization_id = $1 AND a.approval_id = $2`,
    [organizationId, approvalId],
  );
  return result.rows[0] ?? null;
}

export async function listPendingApprovals(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<ApprovalDetail[]> {
  const result = await client.query<ApprovalDetail>(
    `SELECT a.approval_id, a.event_id, a.organization_id, a.approver_user_id,
            a.channel_type, a.status, a.expires_at, a.decided_at, a.created_at,
            e.trace_id, e.tool_name, e.agent_id
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     WHERE a.organization_id = $1 AND a.status = 'pending'
     ORDER BY a.created_at ASC`,
    [organizationId],
  );
  return result.rows;
}

export async function decideApproval(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
  approverUserId: string,
  decision: "approved" | "rejected",
): Promise<ApprovalDetail | null> {
  const updated = await client.query<ApprovalRow>(
    `UPDATE approval
     SET status = $1, approver_user_id = $2, decided_at = now()
     WHERE organization_id = $3 AND approval_id = $4 AND status = 'pending'
     RETURNING approval_id, event_id, organization_id, approver_user_id,
               channel_type, status, expires_at, decided_at, created_at`,
    [decision, approverUserId, organizationId, approvalId],
  );
  const row = updated.rows[0];
  if (!row) {
    return null;
  }

  const detail = await getApproval(client, organizationId, approvalId);
  if (!detail) {
    return null;
  }

  if (decision === "approved") {
    await client.query(
      `UPDATE trace SET status = 'running'
       WHERE trace_id = $1 AND organization_id = $2`,
      [detail.trace_id, organizationId],
    );
  } else {
    await client.query(
      `UPDATE trace SET status = 'failed', ended_at = now()
       WHERE trace_id = $1 AND organization_id = $2`,
      [detail.trace_id, organizationId],
    );
  }

  return detail;
}
