import { getPool } from "../db/pool.js";
import { streamAuditEventToSiem } from "../compliance/siem-audit-stream.js";

export async function logAuditEvent(input: {
  tenantId: string;
  userId: string;
  threadId?: string;
  eventType: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO stoa_audit_event (tenant_id, user_id, thread_id, event_type, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.tenantId,
      input.userId,
      input.threadId ?? null,
      input.eventType,
      JSON.stringify(input.metadata),
    ],
  );
  streamAuditEventToSiem({
    tenantId: input.tenantId,
    userId: input.userId,
    threadId: input.threadId,
    eventType: input.eventType,
    metadata: input.metadata,
  });
}
