import nodemailer from "nodemailer";

import {
  resolveOrgEmailDelivery,
  type OrgEmailDelivery,
} from "./org-transactional-from.js";

export class EmailDeliveryError extends Error {
  constructor(
    readonly code: "email_not_configured" | "email_send_failed",
    message: string,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export function getResendApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new EmailDeliveryError(
      "email_not_configured",
      "Transactional email is not configured (RESEND_API_KEY).",
    );
  }
  return apiKey;
}

export function getInviteFromAddress(): string {
  return (
    process.env.INVITE_EMAIL_FROM ??
    "Salanor <invites@notifications.salanor.com>"
  );
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromAddress?: string;
  replyTo?: string;
  /** Platform organization id — loads tenant SMTP / From overrides when set. */
  organizationId?: string | null;
};

async function sendViaResend(input: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = getResendApiKey();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      ...(input.replyTo ? { reply_to: [input.replyTo] } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[salanor-id] Resend delivery failed:", response.status, errText);
    throw new EmailDeliveryError("email_send_failed", "Failed to send email");
  }
}

async function sendViaSmtp(
  delivery: NonNullable<OrgEmailDelivery["smtp"]>,
  input: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: delivery.host,
    port: delivery.port,
    secure: delivery.secure,
    auth: {
      user: delivery.user,
      pass: delivery.password,
    },
  });

  try {
    await transporter.sendMail({
      from: input.from,
      to: input.to,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (error) {
    console.error("[salanor-id] SMTP delivery failed:", error);
    throw new EmailDeliveryError("email_send_failed", "Failed to send email");
  } finally {
    transporter.close();
  }
}

/** Send using the org's SMTP when configured; otherwise Salanor Resend. */
export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<void> {
  let orgDelivery: OrgEmailDelivery | null = null;
  if (input.organizationId) {
    orgDelivery = await resolveOrgEmailDelivery(input.organizationId);
  }

  const from =
    input.fromAddress?.trim() ||
    orgDelivery?.from ||
    getInviteFromAddress();
  const replyTo = input.replyTo?.trim() || orgDelivery?.replyTo;

  if (orgDelivery?.mode === "smtp") {
    if (!orgDelivery.smtp) {
      throw new EmailDeliveryError(
        "email_not_configured",
        "SMTP is selected but host, username or password is missing.",
      );
    }
    await sendViaSmtp(orgDelivery.smtp, {
      from,
      to: input.to,
      replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return;
  }

  await sendViaResend({
    from,
    to: input.to,
    replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
