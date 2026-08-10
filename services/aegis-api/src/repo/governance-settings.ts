import type pg from "pg";

export type GovernanceNotifications = {
  email_enabled: boolean;
  slack_webhook_url: string | null;
  pagerduty_routing_key: string | null;
  sms_numbers: string[];
};

export type GovernanceSettings = {
  approval_ttl_hours: number;
  stale_trace_hours: number;
  notifications: GovernanceNotifications;
};

const DEFAULTS: GovernanceSettings = {
  approval_ttl_hours: 24,
  stale_trace_hours: 72,
  notifications: {
    email_enabled: true,
    slack_webhook_url: null,
    pagerduty_routing_key: null,
    sms_numbers: [],
  },
};

function clampHours(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeNotifications(raw: unknown): GovernanceNotifications {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sms = Array.isArray(obj.sms_numbers)
    ? obj.sms_numbers.map((v) => String(v).trim()).filter(Boolean)
    : [];
  return {
    email_enabled: obj.email_enabled !== false,
    slack_webhook_url:
      typeof obj.slack_webhook_url === "string" && obj.slack_webhook_url.trim()
        ? obj.slack_webhook_url.trim()
        : null,
    pagerduty_routing_key:
      typeof obj.pagerduty_routing_key === "string" &&
      obj.pagerduty_routing_key.trim()
        ? obj.pagerduty_routing_key.trim()
        : null,
    sms_numbers: sms.slice(0, 10),
  };
}

export function parseGovernanceSettings(raw: unknown): GovernanceSettings {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    approval_ttl_hours: clampHours(obj.approval_ttl_hours, 1, 168, DEFAULTS.approval_ttl_hours),
    stale_trace_hours: clampHours(obj.stale_trace_hours, 1, 720, DEFAULTS.stale_trace_hours),
    notifications: normalizeNotifications(obj.notifications),
  };
}

export async function getGovernanceSettings(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<GovernanceSettings> {
  const result = await client.query<{ governance_settings: unknown }>(
    `SELECT governance_settings FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return parseGovernanceSettings(result.rows[0]?.governance_settings);
}

export async function updateGovernanceSettings(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  input: Partial<GovernanceSettings>,
): Promise<GovernanceSettings> {
  const current = await getGovernanceSettings(client, organizationId);
  const merged: GovernanceSettings = {
    approval_ttl_hours:
      input.approval_ttl_hours !== undefined
        ? clampHours(input.approval_ttl_hours, 1, 168, current.approval_ttl_hours)
        : current.approval_ttl_hours,
    stale_trace_hours:
      input.stale_trace_hours !== undefined
        ? clampHours(input.stale_trace_hours, 1, 720, current.stale_trace_hours)
        : current.stale_trace_hours,
    notifications: {
      ...current.notifications,
      ...(input.notifications ?? {}),
      sms_numbers:
        input.notifications?.sms_numbers ?? current.notifications.sms_numbers,
    },
  };

  await client.query(
    `UPDATE organization SET governance_settings = $2::jsonb, updated_at = now()
     WHERE organization_id = $1`,
    [organizationId, JSON.stringify(merged)],
  );
  return merged;
}

export function governanceSettingsForClient(settings: GovernanceSettings) {
  return {
    approval_ttl_hours: settings.approval_ttl_hours,
    stale_trace_hours: settings.stale_trace_hours,
    notifications: {
      email_enabled: settings.notifications.email_enabled,
      slack_webhook_url: settings.notifications.slack_webhook_url,
      pagerduty_routing_key: settings.notifications.pagerduty_routing_key
        ? "••••••••"
        : null,
      pagerduty_configured: Boolean(settings.notifications.pagerduty_routing_key),
      sms_numbers: settings.notifications.sms_numbers,
      slack_configured: Boolean(settings.notifications.slack_webhook_url),
    },
  };
}
