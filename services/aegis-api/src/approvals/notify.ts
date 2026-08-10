import type pg from "pg";
import {
  getGovernanceSettings,
  type GovernanceSettings,
} from "../repo/governance-settings.js";

export type ApprovalNotifyContext = {
  organizationId: string;
  approvalId: string;
  toolName: string;
  traceId: string;
  eventId: string;
  requestSummary?: string;
  amountUsd?: number;
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
  },
): Promise<void> {
  const lines = [
    `*Approval required* — ${input.orgName}`,
    `Tool: \`${input.toolName}\``,
  ];
  if (input.amountUsd != null) {
    lines.push(`Amount: $${input.amountUsd.toLocaleString()} USD`);
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

async function sendApprovalEmail(
  to: string,
  input: {
    orgName: string;
    toolName: string;
    approveUrl: string;
    ttlHours: number;
    requestSummary?: string;
    amountUsd?: number;
  },
): Promise<void> {
  const from =
    process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
  const subject = `Approval required: ${input.toolName}`;
  const detailLines: string[] = [`Tool: ${input.toolName}`];
  if (input.amountUsd != null) {
    detailLines.push(`Amount: $${input.amountUsd.toLocaleString()} USD`);
  }
  if (input.requestSummary) {
    detailLines.push(input.requestSummary);
  }
  const bodyText = [
    `A tool call in ${input.orgName} is waiting for your approval.`,
    "",
    ...detailLines,
    "",
    `Review and approve in the Salanor Console:`,
    input.approveUrl,
    "",
    "The trace stays blocked until an admin approves or rejects.",
    `Pending approvals expire after ${ttlLabel(input.ttlHours)} if not decided.`,
  ].join("\n");

  console.log("\n[aegis-api] ── Approval notification ─────────────────────");
  console.log(`  To:      ${to}`);
  console.log(`  Tool:    ${input.toolName}`);
  console.log(`  Review:  ${input.approveUrl}`);
  console.log("[aegis-api] ─────────────────────────────────────────────────\n");

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return;
  }

  const htmlDetail = detailLines.map((l) => `<p>${l}</p>`).join("");
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
      html: `<p>A tool call in <strong>${input.orgName}</strong> is waiting for your approval.</p>
${htmlDetail}
<p><a href="${input.approveUrl}">Review in Salanor Console</a></p>
<p>The trace stays blocked until an admin approves or rejects.</p>
<p>Pending approvals expire after ${ttlLabel(input.ttlHours)} if not decided.</p>`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${errText}`);
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
  },
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    console.warn("[aegis-api] Twilio not configured; skipping SMS to", to);
    return;
  }

  const body = [
    `Salanor Aegis: approval required for ${input.toolName} (${input.orgName}).`,
    `Review: ${input.approveUrl}`,
    `Expires in ${ttlLabel(input.ttlHours)}.`,
  ].join(" ");

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
    throw new Error(`Twilio SMS failed (${response.status}): ${errText}`);
  }
}

async function dispatchNotifications(
  client: pg.Pool | pg.PoolClient,
  ctx: ApprovalNotifyContext,
  org: { name: string },
  governance: GovernanceSettings,
): Promise<void> {
  const approveUrl = approvalConsoleUrl(ctx.approvalId);
  const notify = governance.notifications;
  const ttlHours = governance.approval_ttl_hours;
  const slackUrl =
    notify.slack_webhook_url?.trim() ||
    process.env.APPROVAL_SLACK_WEBHOOK_URL?.trim() ||
    "";

  const payload = {
    orgName: org.name,
    toolName: ctx.toolName,
    traceId: ctx.traceId,
    approveUrl,
    ttlHours,
    requestSummary: ctx.requestSummary,
    amountUsd: ctx.amountUsd,
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
    const emails = await listApproverEmails(client, ctx.organizationId);
    for (const email of emails) {
      try {
        await sendApprovalEmail(email, payload);
      } catch (err) {
        console.error(`[aegis-api] approval email to ${email} failed:`, err);
      }
    }
  }

  for (const phone of notify.sms_numbers) {
    try {
      await sendSmsApproval(phone, payload);
    } catch (err) {
      console.error(`[aegis-api] approval SMS to ${phone} failed:`, err);
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
