import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import { smsDeliveryAvailable } from "../../approvals/notify.js";
import {
  getGovernanceSettings,
  governanceSettingsForClient,
  updateGovernanceSettings,
} from "../../repo/governance-settings.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

export const governanceRoutes = new Hono<{ Variables: ConsoleVariables }>();

governanceRoutes.get("/governance/settings", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  const settings = await getGovernanceSettings(getPool(), orgId);
  return c.json({
    settings: governanceSettingsForClient(settings, {
      smsDeliveryAvailable: smsDeliveryAvailable(),
    }),
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
    notifications?: {
      email_enabled?: boolean;
      slack_webhook_url?: string | null;
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
    notifications,
  });

  await auditFromConsoleSession(getPool(), session, {
    action: "governance.settings_updated",
    resourceType: "organization",
    resourceId: session.organizationId,
    metadata: {
      approval_ttl_hours: updated.approval_ttl_hours,
      stale_trace_hours: updated.stale_trace_hours,
    },
  });

  return c.json({
    settings: governanceSettingsForClient(updated, {
      smsDeliveryAvailable: smsDeliveryAvailable(),
    }),
  });
});
