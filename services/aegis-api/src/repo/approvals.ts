import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { getGovernanceSettings } from "./governance-settings.js";

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

export type ApprovalRichDetail = ApprovalDetail & {
  event_payload: Record<string, unknown> | null;
  approver_email: string | null;
  policy_reason: string | null;
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

  const governance = await getGovernanceSettings(client, params.organizationId);
  const ttlHours = governance.approval_ttl_hours;

  const approvalId = `apr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const tokenHash = createHash("sha256")
    .update(approvalId, "utf8")
    .digest("hex");

  await client.query(
    `INSERT INTO approval (
       approval_id, event_id, organization_id, channel_type, token_hash, status, expires_at
     ) VALUES ($1, $2, $3, 'web_ui', $4, 'pending', now() + ($5::int * interval '1 hour'))`,
    [approvalId, params.eventId, params.organizationId, tokenHash, String(ttlHours)],
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

/** Mark overdue pending approvals expired and fail their traces. */
export async function expireStaleApprovals(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<number> {
  const expired = await client.query<{ approval_id: string; trace_id: string }>(
    `UPDATE approval a
     SET status = 'expired', decided_at = now()
     FROM event e
     WHERE a.event_id = e.event_id
       AND a.organization_id = $1
       AND a.status = 'pending'
       AND a.expires_at IS NOT NULL
       AND a.expires_at < now()
     RETURNING a.approval_id, e.trace_id`,
    [organizationId],
  );

  for (const row of expired.rows) {
    if (row.trace_id) {
      await client.query(
        `UPDATE trace SET status = 'failed', ended_at = now()
         WHERE trace_id = $1 AND organization_id = $2 AND status = 'blocked'`,
        [row.trace_id, organizationId],
      );
    }
  }

  return expired.rowCount ?? 0;
}

function approvalSelectJoin(): string {
  return `
    SELECT a.approval_id, a.event_id, a.organization_id, a.approver_user_id,
           a.channel_type, a.status, a.expires_at, a.decided_at, a.created_at,
           e.trace_id, e.tool_name, e.agent_id,
           e.payload AS event_payload,
           acc.email AS approver_email,
           COALESCE(e.payload->>'rationale', e.payload->>'investor_summary') AS policy_reason
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     LEFT JOIN membership m ON m.membership_id = a.approver_user_id
     LEFT JOIN account acc ON acc.account_id = m.account_id`;
}

export async function getApprovalRich(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
): Promise<ApprovalRichDetail | null> {
  const result = await client.query<ApprovalRichDetail & { event_payload: unknown }>(
    `${approvalSelectJoin()}
     WHERE a.organization_id = $1 AND a.approval_id = $2`,
    [organizationId, approvalId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    event_payload:
      row.event_payload && typeof row.event_payload === "object"
        ? (row.event_payload as Record<string, unknown>)
        : null,
  };
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
): Promise<ApprovalRichDetail[]> {
  await expireStaleApprovals(client, organizationId);
  const result = await client.query<ApprovalRichDetail & { event_payload: unknown }>(
    `${approvalSelectJoin()}
     WHERE a.organization_id = $1 AND a.status = 'pending'
     ORDER BY a.created_at ASC`,
    [organizationId],
  );
  return result.rows.map((row) => ({
    ...row,
    event_payload:
      row.event_payload && typeof row.event_payload === "object"
        ? (row.event_payload as Record<string, unknown>)
        : null,
  }));
}

export async function listRecentApprovals(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  limit = 25,
): Promise<ApprovalRichDetail[]> {
  const result = await listRecentApprovalsPaginated(client, organizationId, {
    limit,
    offset: 0,
  });
  return result.rows;
}

export async function listRecentApprovalsPaginated(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  opts: {
    limit?: number;
    offset?: number;
    decision?: "approved" | "rejected" | "expired" | "all";
    tool?: string;
  },
): Promise<{ rows: ApprovalRichDetail[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const decision = opts.decision ?? "all";
  const tool = opts.tool?.trim() ?? "";

  const statuses =
    decision === "all"
      ? ["approved", "rejected", "expired"]
      : [decision];

  const params: unknown[] = [organizationId, statuses];
  let toolClause = "";
  if (tool) {
    params.push(`%${tool}%`);
    toolClause = ` AND e.tool_name ILIKE $${params.length}`;
  }

  const countResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     WHERE a.organization_id = $1
       AND a.status = ANY($2::text[])
       ${toolClause}`,
    params,
  );

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const result = await client.query<ApprovalRichDetail & { event_payload: unknown }>(
    `${approvalSelectJoin()}
     WHERE a.organization_id = $1
       AND a.status = ANY($2::text[])
       ${toolClause}
     ORDER BY COALESCE(a.decided_at, a.created_at) DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  return {
    rows: result.rows.map((row) => ({
      ...row,
      event_payload:
        row.event_payload && typeof row.event_payload === "object"
          ? (row.event_payload as Record<string, unknown>)
          : null,
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
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
       AND (expires_at IS NULL OR expires_at > now())
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

  if (decision !== "approved") {
    await client.query(
      `UPDATE trace SET status = 'failed', ended_at = now()
       WHERE trace_id = $1 AND organization_id = $2`,
      [detail.trace_id, organizationId],
    );
  }

  return detail;
}
