import { getPool } from "../db/pool.js";
import type { TenantRetentionSettings } from "../tenant/settings.js";

export type RetentionRunResult = {
  threadsDeleted: number;
  messagesDeleted: number;
  attachmentsDeleted: number;
};

export async function runTenantRetention(
  tenantId: string,
  retention: TenantRetentionSettings,
): Promise<RetentionRunResult> {
  if (!retention.enforce) {
    return { threadsDeleted: 0, messagesDeleted: 0, attachmentsDeleted: 0 };
  }
  const pool = getPool();
  const client = await pool.connect();
  let threadsDeleted = 0;
  let messagesDeleted = 0;
  let attachmentsDeleted = 0;

  try {
    await client.query("BEGIN");

    if (retention.messageRetentionDays != null && retention.messageRetentionDays > 0) {
      const msgDel = await client.query<{ count: string }>(
        `WITH doomed AS (
           SELECT m.id
           FROM stoa_message m
           JOIN stoa_thread t ON t.id = m.thread_id
           WHERE t.tenant_id = $1
             AND m.created_at < now() - ($2::int || ' days')::interval
         )
         DELETE FROM stoa_message m
         USING doomed d
         WHERE m.id = d.id
         RETURNING m.id`,
        [tenantId, retention.messageRetentionDays],
      );
      messagesDeleted = msgDel.rowCount ?? 0;
    }

    if (retention.threadRetentionDays != null && retention.threadRetentionDays > 0) {
      const threadDel = await client.query(
        `DELETE FROM stoa_thread t
         WHERE t.tenant_id = $1
           AND t.updated_at < now() - ($2::int || ' days')::interval
           AND NOT EXISTS (SELECT 1 FROM stoa_message m WHERE m.thread_id = t.id)`,
        [tenantId, retention.threadRetentionDays],
      );
      threadsDeleted = threadDel.rowCount ?? 0;
    }

    if (
      retention.attachmentRetentionDays != null &&
      retention.attachmentRetentionDays > 0
    ) {
      const attachDel = await client.query(
        `DELETE FROM stoa_attachment a
         WHERE a.tenant_id = $1
           AND a.created_at < now() - ($2::int || ' days')::interval
           AND NOT EXISTS (
             SELECT 1 FROM stoa_message_attachment ma WHERE ma.attachment_id = a.id
           )`,
        [tenantId, retention.attachmentRetentionDays],
      );
      attachmentsDeleted = attachDel.rowCount ?? 0;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { threadsDeleted, messagesDeleted, attachmentsDeleted };
}
