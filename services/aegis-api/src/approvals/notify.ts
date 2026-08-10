import type pg from "pg";
import {
  getGovernanceSettings,
  type GovernanceSettings,
} from "../repo/governance-settings.js";
import { buildRequestPreview } from "./request-preview.js";

export type ApprovalNotifyContext = {
  organizationId: string;
  approvalId: string;
  toolName: string;
  traceId: string;
  eventId: string;
  requestSummary?: string;
  amountUsd?: number;
  recipient?: string;
};

async function loadOrgMeta(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<{ slug: string; name: string } | null> {
  const result = await client.query<{ slug: string; name: string }>(
    `SELECT slug, name FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return result.rows[0] ?? null;
}

async function enrichFromEvent(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
): Promise<ApprovalNotifyContext> {
  const result = await client.query<{ payload: unknown }>(
    `SELECT payload FROM event WHERE event_id = $1`,
    [ctx.eventId],
  );
  const payload =
    result.rows[0]?.payload && typeof result.rows[0].payload === "object"
      ? (result.rows[0].payload as Record<string, unknown>)
      : null;
  const preview = buildRequestPreview(payload);
  const recipient =
    preview.fields.find((f) => f.key === "recipient")?.value ??
    preview.fields.find((f) => f.key === "to")?.value;

  return {
    ...ctx,
    amountUsd: ctx.amountUsd ?? preview.amount_usd,
    requestSummary: ctx.requestSummary ?? preview.summary,
    recipient: ctx.recipient ?? recipient,
  };
}

async function listApproverEmails(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string[]> {
  const override = process.env.APPROVAL_NOTIFY_EMAIL?.trim();
  if (override) {
    return override
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }

  const result = await client.query<{ email: string }>(
    `SELECT DISTINCT a.email
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1
       AND m.role = 'admin'
       AND m.status = 'active'
       AND a.email IS NOT NULL`,
    [organizationId],
  );
  return result.rows.map((r) => r.email).filter(Boolean);
}

function approvalConsoleUrl(approvalId: string): string {
  const origin = (process.env.CONSOLE_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${origin}/aegis/approvals?focus=${encodeURIComponent(approvalId)}`;
}

function ttlLabel(hours: number): string {
  if (hours === 1) return "1 hour";
  if (hours < 24) return `${hours} hours`;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "24 hours" : `${days} days`;
  }
  return `${hours} hours`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendSlackApproval(
  webhookUrl: string,
  input: {
    orgName: string;
    toolName: string;
    traceId: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const lines = [
    `*Approval required* (${input.orgName})`,
    `Tool: \`${input.toolName}\``,
  ];
  if (input.amountUsd != null) {
    lines.push(`Amount: $${input.amountUsd.toLocaleString()} USD`);
  }
  if (input.recipient) {
    lines.push(`Recipient: ${input.recipient}`);
  }
  if (input.requestSummary) {
    lines.push(input.requestSummary);
  }
  lines.push(
    `Trace: \`${input.traceId}\``,
    `Expires in ${ttlLabel(input.ttlHours)}`,
    `<${input.approveUrl}|Review in Salanor Console>`,
  );

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Slack webhook failed (${response.status}): ${body}`);
  }
}

function approvalEmailHtml(input: {
  orgName: string;
  toolName: string;
  approveUrl: string;
  ttlHours: number;
  requestSummary?: string;
  amountUsd?: number;
  recipient?: string;
}): string {
  const rows: string[] = [];
  rows.push(
    `<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;width:120px;">Tool</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;"><code style="font-size:14px;">${escapeHtml(input.toolName)}</code></td></tr>`,
  );
  if (input.amountUsd != null) {
    rows.push(
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Amount</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;">$${escapeHtml(input.amountUsd.toLocaleString())} USD</td></tr>`,
    );
  }
  if (input.recipient) {
    rows.push(
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Recipient</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.recipient)}</td></tr>`,
    );
  }
  if (input.requestSummary) {
    rows.push(
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">Summary</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${escapeHtml(input.requestSummary)}</td></tr>`,
    );
  }
  rows.push(
    `<tr><td style="padding:10px 14px;color:#64748b;">Expires</td><td style="padding:10px 14px;">${escapeHtml(ttlLabel(input.ttlHours))}</td></tr>`,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;padding:0 16px;">
    <div style="background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="background:#0f766e;padding:20px 24px;">
        <p style="margin:0;font-size:13px;color:#99f6e4;text-transform:uppercase;letter-spacing:0.05em;">Salanor Aegis</p>
        <h1 style="margin:8px 0 0;font-size:22px;color:#fff;font-weight:600;">Approval required</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
          A governed action in <strong>${escapeHtml(input.orgName)}</strong> is blocked until an administrator approves or rejects it.
        </p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:6px;margin:0 0 24px;font-size:14px;">
          ${rows.join("")}
        </table>
        <a href="${escapeHtml(input.approveUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Review in Console</a>
        <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
          The workflow stays paused until you decide. If no action is taken, the request expires automatically.
        </p>
      </div>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      Salanor Aegis · Agent governance console
    </p>
  </div>
</body>
</html>`;
}

async function sendApprovalEmail(
  to: string,
  input: {
    orgName: string;
    toolName: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const from =
    process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
  const subject = `Approval required: ${input.toolName}`;
  const detailLines: string[] = [`Tool: ${input.toolName}`];
  if (input.amountUsd != null) {
    detailLines.push(`Amount: $${input.amountUsd.toLocaleString()} USD`);
  }
  if (input.recipient) {
    detailLines.push(`Recipient: ${input.recipient}`);
  }
  if (input.requestSummary) {
    detailLines.push(`Summary: ${input.requestSummary}`);
  }
  const bodyText = [
    `Approval required in ${input.orgName}`,
    "",
    ...detailLines,
    "",
    `Review and decide: ${input.approveUrl}`,
    "",
    `Expires in ${ttlLabel(input.ttlHours)} if not decided.`,
  ].join("\n");

  console.log("\n[aegis-api] Approval notification email");
  console.log(`  To:     ${to}`);
  console.log(`  Tool:   ${input.toolName}`);
  console.log(`  Review: ${input.approveUrl}\n`);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: bodyText,
      html: approvalEmailHtml(input),
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Email delivery failed (${response.status}): ${errText}`);
  }
}

async function sendPagerDutyApproval(
  routingKey: string,
  input: {
    orgName: string;
    toolName: string;
    traceId: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
    recipient?: string;
  },
): Promise<void> {
  const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: `aegis-approval-${input.traceId}`,
      payload: {
        summary: `Aegis approval required: ${input.toolName} (${input.orgName})`,
        severity: "warning",
        source: "salanor-aegis",
        custom_details: {
          organization: input.orgName,
          tool_name: input.toolName,
          trace_id: input.traceId,
          amount_usd: input.amountUsd,
          recipient: input.recipient,
          request_summary: input.requestSummary,
          expires_in: ttlLabel(input.ttlHours),
        },
      },
      links: [{ href: input.approveUrl, text: "Review in Salanor Console" }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PagerDuty enqueue failed (${response.status}): ${body}`);
  }
}

async function sendSmsApproval(
  to: string,
  input: {
    orgName: string;
    toolName: string;
    approveUrl: string;
    ttlHours: number;
    amountUsd?: number;
  },
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return;
  }

  const amountPart =
    input.amountUsd != null ? ` $${input.amountUsd.toLocaleString()}.` : "";
  const body = `Salanor: approval required for ${input.toolName} (${input.orgName}).${amountPart} ${input.approveUrl} Expires ${ttlLabel(input.ttlHours)}.`;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`SMS delivery failed (${response.status}): ${errText}`);
  }
}

async function dispatchNotifications(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
  org: { name: string },
  governance: GovernanceSettings,
): Promise<void> {
  const enriched = await enrichFromEvent(client, ctx);
  const approveUrl = approvalConsoleUrl(enriched.approvalId);
  const notify = governance.notifications;
  const ttlHours = governance.approval_ttl_hours;
  const slackUrl =
    notify.slack_webhook_url?.trim() ||
    process.env.APPROVAL_SLACK_WEBHOOK_URL?.trim() ||
    "";

  const payload = {
    orgName: org.name,
    toolName: enriched.toolName,
    traceId: enriched.traceId,
    approveUrl,
    ttlHours,
    requestSummary: enriched.requestSummary,
    amountUsd: enriched.amountUsd,
    recipient: enriched.recipient,
  };

  if (slackUrl) {
    try {
      await sendSlackApproval(slackUrl, payload);
    } catch (err) {
      console.error("[aegis-api] approval Slack notify failed:", err);
    }
  }

  if (notify.pagerduty_routing_key) {
    try {
      await sendPagerDutyApproval(notify.pagerduty_routing_key, payload);
    } catch (err) {
      console.error("[aegis-api] approval PagerDuty notify failed:", err);
    }
  }

  if (notify.email_enabled) {
    const emails = await listApproverEmails(client, enriched.organizationId);
    for (const email of emails) {
      try {
        await sendApprovalEmail(email, payload);
      } catch (err) {
        console.error(`[aegis-api] approval email to ${email} failed:`, err);
      }
    }
  }

  if (notify.sms_numbers.length > 0) {
    for (const phone of notify.sms_numbers) {
      try {
        await sendSmsApproval(phone, payload);
      } catch (err) {
        console.error(`[aegis-api] approval SMS to ${phone} failed:`, err);
      }
    }
  }
}

/** Fire-and-forget: email, Slack, PagerDuty, SMS per org governance settings. */
export function notifyApprovalPending(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
): void {
  void (async () => {
    const org = await loadOrgMeta(client, ctx.organizationId);
    if (!org) return;
    const governance = await getGovernanceSettings(client, ctx.organizationId);
    await dispatchNotifications(client, ctx, org, governance);
  })();
}

export function smsDeliveryAvailable(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}
