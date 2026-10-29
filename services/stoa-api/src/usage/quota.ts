import { getPool } from "../db/pool.js";
import { isPgMissingRelation } from "../lib/pg-error.js";
import type { TenantQuotaSettings } from "../tenant/settings.js";

function currentPeriodMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export type UsageSnapshot = {
  periodMonth: string;
  userMessages: number;
  orgMessages: number;
  orgAttachmentBytes: number;
};

export async function getUsageSnapshot(
  tenantId: string,
  userId: string,
): Promise<UsageSnapshot> {
  const period = currentPeriodMonth();
  const pool = getPool();
  try {
    return await loadUsageSnapshot(pool, tenantId, userId, period);
  } catch (error) {
    if (isPgMissingRelation(error, "stoa_usage_monthly")) {
      return {
        periodMonth: period,
        userMessages: 0,
        orgMessages: 0,
        orgAttachmentBytes: 0,
      };
    }
    throw error;
  }
}

async function loadUsageSnapshot(
  pool: ReturnType<typeof getPool>,
  tenantId: string,
  userId: string,
  period: string,
): Promise<UsageSnapshot> {
  const userRow = await pool.query<{ message_count: string }>(
    `SELECT COALESCE(message_count, 0)::text AS message_count
     FROM stoa_usage_monthly
     WHERE tenant_id = $1 AND user_id = $2 AND period_month = $3::date`,
    [tenantId, userId, period],
  );
  const orgRow = await pool.query<{
    messages: string;
    bytes: string;
  }>(
    `SELECT
       COALESCE(SUM(message_count), 0)::text AS messages,
       COALESCE(SUM(attachment_bytes), 0)::text AS bytes
     FROM stoa_usage_monthly
     WHERE tenant_id = $1 AND period_month = $2::date`,
    [tenantId, period],
  );
  return {
    periodMonth: period,
    userMessages: Number(userRow.rows[0]?.message_count ?? 0),
    orgMessages: Number(orgRow.rows[0]?.messages ?? 0),
    orgAttachmentBytes: Number(orgRow.rows[0]?.bytes ?? 0),
  };
}

export async function usageTrackingReady(): Promise<boolean> {
  const pool = getPool();
  const row = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'stoa_usage_monthly'
     ) AS ok`,
  );
  return row.rows[0]?.ok === true;
}

export type QuotaCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function assertWithinQuotas(
  tenantId: string,
  userId: string,
  quotas: TenantQuotaSettings,
  extraAttachmentBytes = 0,
): Promise<QuotaCheckResult> {
  if (!quotas.enforce) {
    return { ok: true };
  }
  const usage = await getUsageSnapshot(tenantId, userId);
  if (usage.userMessages >= quotas.maxMessagesPerUserMonth) {
    return {
      ok: false,
      reason: `Monthly message limit reached (${quotas.maxMessagesPerUserMonth} per user).`,
    };
  }
  if (usage.orgMessages >= quotas.maxMessagesOrgMonth) {
    return {
      ok: false,
      reason: `Organization monthly message limit reached (${quotas.maxMessagesOrgMonth}).`,
    };
  }
  const maxBytes = quotas.maxAttachmentMbPerOrgMonth * 1024 * 1024;
  if (usage.orgAttachmentBytes + extraAttachmentBytes > maxBytes) {
    return {
      ok: false,
      reason: `Organization monthly attachment storage limit reached (${quotas.maxAttachmentMbPerOrgMonth} MB).`,
    };
  }
  return { ok: true };
}

export async function recordMessageUsage(
  tenantId: string,
  userId: string,
  attachmentBytes = 0,
): Promise<void> {
  const period = currentPeriodMonth();
  try {
    await getPool().query(
      `INSERT INTO stoa_usage_monthly (tenant_id, user_id, period_month, message_count, attachment_bytes)
       VALUES ($1, $2, $3::date, 1, $4)
       ON CONFLICT (tenant_id, user_id, period_month)
       DO UPDATE SET
         message_count = stoa_usage_monthly.message_count + 1,
         attachment_bytes = stoa_usage_monthly.attachment_bytes + EXCLUDED.attachment_bytes`,
      [tenantId, userId, period, attachmentBytes],
    );
  } catch (error) {
    if (isPgMissingRelation(error, "stoa_usage_monthly")) {
      return;
    }
    throw error;
  }
}

export async function recordAttachmentBytes(
  tenantId: string,
  userId: string,
  bytes: number,
): Promise<void> {
  const period = currentPeriodMonth();
  await getPool().query(
    `INSERT INTO stoa_usage_monthly (tenant_id, user_id, period_month, message_count, attachment_bytes)
     VALUES ($1, $2, $3::date, 0, $4)
     ON CONFLICT (tenant_id, user_id, period_month)
     DO UPDATE SET
       attachment_bytes = stoa_usage_monthly.attachment_bytes + EXCLUDED.attachment_bytes`,
    [tenantId, userId, period, bytes],
  );
}
