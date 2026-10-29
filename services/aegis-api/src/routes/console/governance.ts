import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { smsDeliveryAvailable } from "../../approvals/notify.js";
import {
  getGovernanceSettings,
  governanceSettingsForClient,
  updateGovernanceSettings,
} from "../../repo/governance-settings.js";
import { ensureDefaultScoreBands } from "../../repo/score-bands.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const governanceRoutes = new Hono<{ Variables: ConsoleVariables }>();

async function readSignalSettings(organizationId: string) {
  const result = await getPool().query<{
    signal_fallback: string;
    signal_stale_hours: number;
  }>(
    `SELECT COALESCE(signal_fallback, 'allow_with_obligation') AS signal_fallback,
            COALESCE(signal_stale_hours, 24)::int AS signal_stale_hours
     FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  const row = result.rows[0];
  const fallback = row?.signal_fallback;
  return {
    signal_fallback:
      fallback === "allow" || fallback === "deny"
        ? fallback
        : ("allow_with_obligation" as const),
    signal_stale_hours: Number(row?.signal_stale_hours ?? 24),
  };
}

governanceRoutes.get("/governance/settings", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const settings = await getGovernanceSettings(getPool(), orgId);
  const signal = await readSignalSettings(orgId).catch(() => ({
    signal_fallback: "allow_with_obligation" as const,
    signal_stale_hours: 24,
  }));
  const bands = await ensureDefaultScoreBands(getPool(), orgId, "production").catch(
    () => [],
  );
  return c.json({
    settings: {
      ...governanceSettingsForClient(settings, {
        smsDeliveryAvailable: smsDeliveryAvailable(),
      }),
      ...signal,
      score_bands: bands,
    },
  });
});

governanceRoutes.patch("/governance/settings", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: {
    approval_ttl_hours?: number;
    stale_trace_hours?: number;
    required_approvers?: number;
    escalation_after_hours?: number;
    on_expiry?: "deny" | "expire";
    two_person_policy_activate?: boolean;
    signal_fallback?: "allow" | "allow_with_obligation" | "deny";
    signal_stale_hours?: number;
    notifications?: {
      email_enabled?: boolean;
      slack_webhook_url?: string | null;
      teams_webhook_url?: string | null;
      pagerduty_routing_key?: string | null;
      sms_numbers?: string[];
    };
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const current = await getGovernanceSettings(getPool(), session.organizationId);
  const notifications = { ...current.notifications };

  if (body.notifications) {
    if (body.notifications.email_enabled !== undefined) {
      notifications.email_enabled = body.notifications.email_enabled;
    }
    if (body.notifications.slack_webhook_url !== undefined) {
      const url = body.notifications.slack_webhook_url?.trim() || null;
      notifications.slack_webhook_url = url;
    }
    if (body.notifications.teams_webhook_url !== undefined) {
      notifications.teams_webhook_url =
        body.notifications.teams_webhook_url?.trim() || null;
    }
    if (body.notifications.pagerduty_routing_key !== undefined) {
      const key = body.notifications.pagerduty_routing_key?.trim();
      if (key && key !== "••••••••") {
        notifications.pagerduty_routing_key = key;
      } else if (!key) {
        notifications.pagerduty_routing_key = null;
      }
    }
    if (body.notifications.sms_numbers !== undefined) {
      notifications.sms_numbers = body.notifications.sms_numbers
        .map((n) => n.trim())
        .filter(Boolean)
        .slice(0, 10);
    }
  }

  const updated = await updateGovernanceSettings(getPool(), session.organizationId, {
    approval_ttl_hours: body.approval_ttl_hours,
    stale_trace_hours: body.stale_trace_hours,
    required_approvers:
      body.required_approvers !== undefined
        ? body.required_approvers >= 2
          ? 2
          : 1
        : undefined,
    escalation_after_hours: body.escalation_after_hours,
    on_expiry: body.on_expiry,
    two_person_policy_activate: body.two_person_policy_activate,
    notifications,
  });

  if (body.signal_fallback !== undefined || body.signal_stale_hours !== undefined) {
    const signal = await readSignalSettings(session.organizationId).catch(() => ({
      signal_fallback: "allow_with_obligation" as const,
      signal_stale_hours: 24,
    }));
    const nextFallback =
      body.signal_fallback === "allow" ||
      body.signal_fallback === "deny" ||
      body.signal_fallback === "allow_with_obligation"
        ? body.signal_fallback
        : signal.signal_fallback;
    const nextStale =
      typeof body.signal_stale_hours === "number" && Number.isFinite(body.signal_stale_hours)
        ? Math.min(168, Math.max(1, Math.round(body.signal_stale_hours)))
        : signal.signal_stale_hours;
    await getPool().query(
      `UPDATE organization
       SET signal_fallback = $2, signal_stale_hours = $3, updated_at = now()
       WHERE organization_id = $1`,
      [session.organizationId, nextFallback, nextStale],
    );
  }

  await auditFromConsoleSession(getPool(), session, {
    action: "governance.settings_updated",
    resourceType: "organization",
    resourceId: session.organizationId,
    metadata: {
      approval_ttl_hours: updated.approval_ttl_hours,
      stale_trace_hours: updated.stale_trace_hours,
      required_approvers: updated.required_approvers,
      escalation_after_hours: updated.escalation_after_hours,
      on_expiry: updated.on_expiry,
      two_person_policy_activate: updated.two_person_policy_activate,
      signal_fallback: body.signal_fallback,
      signal_stale_hours: body.signal_stale_hours,
    },
  });

  const signal = await readSignalSettings(session.organizationId).catch(() => ({
    signal_fallback: "allow_with_obligation" as const,
    signal_stale_hours: 24,
  }));
  const bands = await ensureDefaultScoreBands(
    getPool(),
    session.organizationId,
    "production",
  ).catch(() => []);

  return c.json({
    settings: {
      ...governanceSettingsForClient(updated, {
        smsDeliveryAvailable: smsDeliveryAvailable(),
      }),
      ...signal,
      score_bands: bands,
    },
  });
});
