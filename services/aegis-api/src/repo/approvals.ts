import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { digestActionPayload } from "../approvals/action-digest.js";
import { patchSignedEventPayload } from "../crypto/event-resign.js";
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
  key_id: string;
  metadata?: Record<string, unknown> | null;
};

export type ApprovalRichDetail = ApprovalDetail & {
  event_payload: Record<string, unknown> | null;
  approver_email: string | null;
  policy_reason: string | null;
  metadata?: Record<string, unknown> | null;
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

  // Prefer leaving the already-signed policy gate intact. wrapFetch usually
  // embeds deferred_request before ingest. Only re-sign when we must attach
  // deferred and a bridge key is available — never mutate payload unsigned
  // (that produced signature_invalid / event_hash_mismatch on Verify).
  const existingPayload = await client.query<{ payload: unknown }>(
    `SELECT payload FROM event WHERE organization_id = $1 AND event_id = $2`,
    [params.organizationId, params.eventId],
  );
  const payload =
    existingPayload.rows[0]?.payload &&
    typeof existingPayload.rows[0].payload === "object" &&
    !Array.isArray(existingPayload.rows[0].payload)
      ? (existingPayload.rows[0].payload as Record<string, unknown>)
      : {};
  const hasDeferred =
    payload.deferred_request &&
    typeof payload.deferred_request === "object" &&
    typeof (payload.deferred_request as { url?: unknown }).url === "string";

  if (!hasDeferred) {
    const patch = {
      deferred_request: params.deferred,
      obligation_tool: params.toolName,
    };
    const resigned = await patchSignedEventPayload(client, {
      organizationId: params.organizationId,
      eventId: params.eventId,
      patch,
    });
    if (!resigned) {
      console.warn(
        `[approvals] deferred_request not on event ${params.eventId} and bridge resign unavailable; leaving seal intact`,
      );
    }
  }

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
       AND a.status IN ('pending', 'needs_info')
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
           COALESCE(a.metadata, '{}'::jsonb) AS metadata,
           e.trace_id, e.tool_name, e.agent_id, e.key_id,
           e.payload AS event_payload,
           acc.email AS approver_email,
           COALESCE(e.payload->>'rationale', e.payload->>'investor_summary', e.payload->>'reason') AS policy_reason
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
  const meta = (row as { metadata?: unknown }).metadata;
  return {
    ...row,
    metadata:
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {},
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
  const result = await client.query<ApprovalDetail & { metadata: unknown }>(
    `SELECT a.approval_id, a.event_id, a.organization_id, a.approver_user_id,
            a.channel_type, a.status, a.expires_at, a.decided_at, a.created_at,
            COALESCE(a.metadata, '{}'::jsonb) AS metadata,
            e.trace_id, e.tool_name, e.agent_id, e.key_id
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     WHERE a.organization_id = $1 AND a.approval_id = $2`,
    [organizationId, approvalId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const meta = row.metadata;
  return {
    ...row,
    metadata:
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {},
  };
}

/** Close pending approvals when the trace is no longer waiting (failed or completed). */
export async function voidPendingApprovalsForTerminalTrace(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<number> {
  const result = await client.query(
    `UPDATE approval a
     SET status = 'expired', decided_at = now()
     FROM event e
     JOIN trace t ON t.trace_id = e.trace_id AND t.organization_id = e.organization_id
     WHERE a.event_id = e.event_id
       AND a.organization_id = $1
       AND e.trace_id = $2
       AND a.status = 'pending'
       AND t.status IN ('failed', 'completed')`,
    [organizationId, traceId],
  );
  return result.rowCount ?? 0;
}

/** Expire pending approvals whose trace already ended. */
export async function syncPendingApprovalsWithTraces(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<number> {
  const result = await client.query(
    `UPDATE approval a
     SET status = 'expired', decided_at = now()
     FROM event e
     JOIN trace t ON t.trace_id = e.trace_id AND t.organization_id = e.organization_id
     WHERE a.event_id = e.event_id
       AND a.organization_id = $1
       AND a.status = 'pending'
       AND t.status IN ('failed', 'completed')`,
    [organizationId],
  );
  return result.rowCount ?? 0;
}

export async function listPendingApprovals(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<ApprovalRichDetail[]> {
  await expireStaleApprovals(client, organizationId);
  await syncPendingApprovalsWithTraces(client, organizationId);
  const result = await client.query<ApprovalRichDetail & { event_payload: unknown }>(
    `${approvalSelectJoin()}
     WHERE a.organization_id = $1 AND a.status IN ('pending', 'needs_info')
     ORDER BY
       CASE WHEN a.expires_at IS NULL THEN 1 ELSE 0 END,
       a.expires_at ASC NULLS LAST,
       a.created_at ASC`,
    [organizationId],
  );
  return result.rows.map((row) => {
    const meta = (row as { metadata?: unknown }).metadata;
    return {
      ...row,
      metadata:
        meta && typeof meta === "object" && !Array.isArray(meta)
          ? (meta as Record<string, unknown>)
          : {},
      event_payload:
        row.event_payload && typeof row.event_payload === "object"
          ? (row.event_payload as Record<string, unknown>)
          : null,
    };
  });
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

/**
 * Phase 2 four-eyes foundation: reject when the deciding human is the same
 * principal recorded on the gate event (requester / on-behalf-of).
 */
export async function assertApproverAllowed(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
  approverEmail: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!approverEmail?.trim()) {
    return { ok: true };
  }
  const row = await client.query<{ payload: unknown }>(
    `SELECT e.payload
     FROM approval a
     JOIN event e ON e.event_id = a.event_id
     WHERE a.organization_id = $1 AND a.approval_id = $2`,
    [organizationId, approvalId],
  );
  const payload =
    row.rows[0]?.payload && typeof row.rows[0].payload === "object"
      ? (row.rows[0].payload as Record<string, unknown>)
      : null;
  if (!payload) return { ok: true };

  const candidates = [
    payload.requester_email,
    payload.on_behalf_of_email,
    payload.on_behalf_of,
    payload.actor_email,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());

  const me = approverEmail.trim().toLowerCase();
  if (candidates.includes(me)) {
    return {
      ok: false,
      error:
        "Four-eyes: you cannot approve or decline your own request. Ask another admin.",
    };
  }
  return { ok: true };
}

export type DecideApprovalResult = {
  detail: ApprovalDetail;
  /** True when the hold is cleared (approved) or stopped (rejected). */
  finalized: boolean;
  votes: number;
  required: number;
};

async function ensureApprovalMetadataColumn(
  client: pg.Pool | pg.PoolClient,
): Promise<void> {
  // Soft-guard for DBs that have not run 006 yet — vote path still works via metadata.
  try {
    await client.query(
      `ALTER TABLE approval
       ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`,
    );
  } catch {
    // ignore if lacking privilege; subsequent queries may still succeed if migrated
  }
}

export async function decideApproval(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
  approverUserId: string,
  decision: "approved" | "rejected",
  options?: { reason?: string; voterEmail?: string | null },
): Promise<DecideApprovalResult | null> {
  await ensureApprovalMetadataColumn(client);
  const governance = await getGovernanceSettings(client, organizationId);
  const required = governance.required_approvers;

  const current = await client.query<{
    status: string;
    metadata: unknown;
    expires_at: Date | null;
  }>(
    `SELECT status, COALESCE(metadata, '{}'::jsonb) AS metadata, expires_at
     FROM approval
     WHERE organization_id = $1 AND approval_id = $2
       AND status IN ('pending', 'needs_info')
       AND (expires_at IS NULL OR expires_at > now())
     FOR UPDATE`,
    [organizationId, approvalId],
  );
  const row = current.rows[0];
  if (!row) {
    return null;
  }

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? ({ ...(row.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const priorVotes = Array.isArray(metadata.votes)
    ? (metadata.votes as Array<Record<string, unknown>>)
    : [];
  if (priorVotes.some((v) => v.voter_user_id === approverUserId)) {
    throw new Error("You already recorded a decision on this approval");
  }

  const vote = {
    vote_id: `vote_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    voter_user_id: approverUserId,
    voter_email: options?.voterEmail ?? null,
    decision,
    reason: options?.reason ?? null,
    at: new Date().toISOString(),
  };
  const votes = [...priorVotes, vote];
  metadata.votes = votes;
  if (row.status === "needs_info") {
    delete metadata.needs_info;
  }

  try {
    await client.query(
      `INSERT INTO approval_vote (
         vote_id, approval_id, organization_id, voter_user_id, voter_email, decision, reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (approval_id, voter_user_id) DO NOTHING`,
      [
        vote.vote_id,
        approvalId,
        organizationId,
        approverUserId,
        options?.voterEmail ?? null,
        decision,
        options?.reason ?? null,
      ],
    );
  } catch {
    // Table may not exist until migrate 006 — metadata remains source of truth.
  }

  const approveVotes = votes.filter((v) => v.decision === "approved");
  const rejectVotes = votes.filter((v) => v.decision === "rejected");
  const finalizedReject = rejectVotes.length > 0;
  const finalizedApprove =
    !finalizedReject && approveVotes.length >= required;
  const finalized = finalizedReject || finalizedApprove;
  const finalStatus = finalizedReject
    ? "rejected"
    : finalizedApprove
      ? "approved"
      : "pending";

  // Claude §13.2 — bind approval to the exact action parameters the human saw.
  if (finalizedApprove) {
    const eventPayload = await client.query<{ payload: unknown }>(
      `SELECT payload FROM event
       WHERE organization_id = $1 AND event_id = (
         SELECT event_id FROM approval
         WHERE organization_id = $1 AND approval_id = $2
       )
       LIMIT 1`,
      [organizationId, approvalId],
    );
    const raw = eventPayload.rows[0]?.payload;
    const payload =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    const { digest, snapshot } = digestActionPayload(payload);
    metadata.approved_action_digest = digest;
    metadata.approved_action_snapshot = snapshot;
    metadata.approved_action_bound_at = new Date().toISOString();
  }

  await client.query(
    `UPDATE approval
     SET metadata = $1::jsonb,
         status = $2,
         approver_user_id = $3,
         decided_at = CASE WHEN $4::boolean THEN now() ELSE decided_at END
     WHERE organization_id = $5 AND approval_id = $6`,
    [
      JSON.stringify(metadata),
      finalStatus,
      approverUserId,
      finalized,
      organizationId,
      approvalId,
    ],
  );

  const detail = await getApproval(client, organizationId, approvalId);
  if (!detail) {
    return null;
  }

  if (finalizedApprove) {
    await client.query(
      `UPDATE trace SET status = 'executing'
       WHERE trace_id = $1 AND organization_id = $2 AND status = 'blocked'`,
      [detail.trace_id, organizationId],
    );
  } else if (finalizedReject) {
    await client.query(
      `UPDATE trace SET status = 'failed', ended_at = now()
       WHERE trace_id = $1 AND organization_id = $2`,
      [detail.trace_id, organizationId],
    );
  }

  return {
    detail,
    finalized,
    votes: approveVotes.length,
    required,
  };
}

export async function askMoreOnApproval(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
  actorUserId: string,
  note: string,
): Promise<ApprovalDetail | null> {
  await ensureApprovalMetadataColumn(client);
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("Ask more requires a note");
  }
  const updated = await client.query(
    `UPDATE approval
     SET status = 'needs_info',
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE organization_id = $2 AND approval_id = $3
       AND status IN ('pending', 'needs_info')
       AND (expires_at IS NULL OR expires_at > now())
     RETURNING approval_id`,
    [
      JSON.stringify({
        needs_info: {
          note: trimmed,
          by: actorUserId,
          at: new Date().toISOString(),
        },
      }),
      organizationId,
      approvalId,
    ],
  );
  if ((updated.rowCount ?? 0) === 0) {
    // Fallback if needs_info status not allowed by CHECK yet
    const fallback = await client.query(
      `UPDATE approval
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
       WHERE organization_id = $2 AND approval_id = $3 AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > now())
       RETURNING approval_id`,
      [
        JSON.stringify({
          needs_info: {
            note: trimmed,
            by: actorUserId,
            at: new Date().toISOString(),
          },
        }),
        organizationId,
        approvalId,
      ],
    );
    if ((fallback.rowCount ?? 0) === 0) return null;
  }
  return getApproval(client, organizationId, approvalId);
}

export async function reassignApproval(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  approvalId: string,
  actorUserId: string,
  assigneeEmail: string,
): Promise<ApprovalDetail | null> {
  await ensureApprovalMetadataColumn(client);
  const email = assigneeEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Assignee must be an email");
  }
  const member = await client.query<{ role: string }>(
    `SELECT lower(m.role) AS role
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1
       AND lower(trim(a.email)) = $2
       AND m.status = 'active'
     LIMIT 1`,
    [organizationId, email],
  );
  if (!member.rows[0]) {
    throw new Error(
      "Assignee email must belong to an active member of this organization",
    );
  }
  const role = member.rows[0].role;
  if (!["admin", "owner", "approver"].includes(role)) {
    throw new Error(
      "Assignee must have Admin, Owner, or Approver role to decide approvals",
    );
  }
  const updated = await client.query(
    `UPDATE approval
     SET status = CASE WHEN status = 'needs_info' THEN 'pending' ELSE status END,
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE organization_id = $2 AND approval_id = $3
       AND status IN ('pending', 'needs_info')
       AND (expires_at IS NULL OR expires_at > now())
     RETURNING approval_id`,
    [
      JSON.stringify({
        reassigned: {
          to: email,
          by: actorUserId,
          at: new Date().toISOString(),
        },
        assignee_email: email,
      }),
      organizationId,
      approvalId,
    ],
  );
  if ((updated.rowCount ?? 0) === 0) return null;
  return getApproval(client, organizationId, approvalId);
}

/** Mark overdue pending approvals for escalation notify (once). */
export async function markEscalationDue(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string[]> {
  await ensureApprovalMetadataColumn(client);
  const settings = await getGovernanceSettings(client, organizationId);
  if (settings.escalation_after_hours <= 0) return [];

  const due = await client.query<{ approval_id: string; metadata: unknown }>(
    `SELECT approval_id, COALESCE(metadata, '{}'::jsonb) AS metadata
     FROM approval
     WHERE organization_id = $1
       AND status IN ('pending', 'needs_info')
       AND (expires_at IS NULL OR expires_at > now())
       AND created_at <= now() - ($2::int * interval '1 hour')
       AND COALESCE(metadata->>'escalated_at', '') = ''`,
    [organizationId, String(settings.escalation_after_hours)],
  );

  const ids: string[] = [];
  for (const row of due.rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    metadata.escalated_at = new Date().toISOString();
    await client.query(
      `UPDATE approval SET metadata = $1::jsonb
       WHERE organization_id = $2 AND approval_id = $3`,
      [JSON.stringify(metadata), organizationId, row.approval_id],
    );
    ids.push(row.approval_id);
  }
  return ids;
}
