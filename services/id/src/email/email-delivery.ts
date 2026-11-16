import { resolvePlatformEmailDelivery } from "@salanor/platform-auth";
import nodemailer from "nodemailer";

import { getPool } from "../db/pool.js";
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

/**
 * Effective platform delivery (SMTP or Resend). Database Platform admin → Email wins;
 * RESEND_API_KEY / INVITE_EMAIL_FROM are the Resend fallback. A database failure falls
 * back to env Resend when present.
 */
export async function resolveResendConfig(): Promise<{
  apiKey: string | null;
  from: string;
}> {
  let pool: ReturnType<typeof getPool> | null = null;
  try {
    pool = getPool();
  } catch {
    pool = null;
  }
  const resolved = await resolvePlatformEmailDelivery(pool);
  return {
    apiKey: resolved.mode === "resend" ? resolved.apiKey : null,
    from: resolved.from,
  };
}

export async function getResendApiKey(): Promise<string> {
  const { apiKey } = await resolveResendConfig();
  if (!apiKey) {
    throw new EmailDeliveryError(
      "email_not_configured",
      "Transactional email is not configured (set SMTP or a Resend key in Platform admin > Email, or RESEND_API_KEY).",
    );
  }
  return apiKey;
}

export async function getInviteFromAddress(): Promise<string> {
  return (await resolveResendConfig()).from;
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
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
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
    let detail = "Failed to send email via Resend.";
    try {
      const parsed = JSON.parse(errText) as { message?: string };
      if (parsed.message?.trim()) detail = parsed.message.trim();
    } catch {
      /* keep default */
    }
    throw new EmailDeliveryError("email_send_failed", detail);
  }
}

async function sendViaSmtp(
  delivery: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  },
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

/** Org SMTP (Stoa) when set; else platform SMTP or Resend from Platform admin. */
export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<void> {
  let orgDelivery: OrgEmailDelivery | null = null;
  if (input.organizationId) {
    orgDelivery = await resolveOrgEmailDelivery(input.organizationId);
  }

  let pool: ReturnType<typeof getPool> | null = null;
  try {
    pool = getPool();
  } catch {
    pool = null;
  }
  const platform = await resolvePlatformEmailDelivery(pool);

  const from =
    input.fromAddress?.trim() ||
    orgDelivery?.from ||
    platform.from;
  const replyTo =
    input.replyTo?.trim() || orgDelivery?.replyTo || platform.replyTo;

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

  if (platform.mode === "smtp" && platform.smtp) {
    await sendViaSmtp(platform.smtp, {
      from,
      to: input.to,
      replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return;
  }

  if (platform.mode === "resend" && platform.apiKey) {
    await sendViaResend({
      apiKey: platform.apiKey,
      from,
      to: input.to,
      replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return;
  }

  throw new EmailDeliveryError(
    "email_not_configured",
    "Transactional email is not configured (set SMTP or a Resend key in Platform admin > Email, or RESEND_API_KEY).",
  );
}
