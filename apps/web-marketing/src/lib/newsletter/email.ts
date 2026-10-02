import { sendEmailViaResend } from "@/lib/send-email-resend";
import { SITE_ORIGIN } from "@/lib/site-origin";

import { newsletterEmailLayout } from "./email-layout";
import { newsletterListMailHeaders } from "./list-headers";
import { newsletterUnsubscribeUrl } from "./urls";

const CONFIRM_TTL_HOURS = Number(process.env.NEWSLETTER_CONFIRM_TTL_HOURS) || 72;

const P =
  'style="margin:0 0 16px;color:#c9d1d9;line-height:1.65;font-size:16px;"';
const MUTED = 'style="margin:0;font-size:14px;color:#8b949e;line-height:1.5;"';

export async function sendNewsletterConfirmEmail(input: {
  email: string;
  confirmToken: string;
}): Promise<{ sent: boolean }> {
  const confirmUrl = `${SITE_ORIGIN}/api/newsletter/confirm?token=${encodeURIComponent(input.confirmToken)}`;
  const subject = "Confirm your Salanor updates subscription";
  const text = [
    "Thanks for subscribing to Salanor research and product updates.",
    "",
    `Confirm your email (link expires in ${CONFIRM_TTL_HOURS} hours):`,
    confirmUrl,
    "",
    "If you did not request this, ignore this email.",
  ].join("\n");

  const bodyHtml = `<p ${P}>Thanks for subscribing to Salanor research and product updates.</p>
<p style="margin:0 0 20px;">
  <a href="${confirmUrl}" style="display:inline-block;background:#43c2a9;color:#0d1117;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">Confirm your email</a>
</p>
<p ${MUTED}>Or copy this link (expires in ${CONFIRM_TTL_HOURS} hours):</p>
<p style="margin:0 0 16px;font-size:13px;word-break:break-all;"><a href="${confirmUrl}" style="color:#43c2a9;text-decoration:underline;">${confirmUrl}</a></p>
<p ${MUTED}>If you did not request this, ignore this email.</p>`;

  const html = newsletterEmailLayout({
    preheader: "Confirm your subscription to Salanor updates",
    bodyHtml,
  });

  const result = await sendEmailViaResend({
    to: input.email,
    subject,
    text,
    html,
  });
  return { sent: result.sent };
}

export async function sendNewsletterWelcomeEmail(input: {
  email: string;
  unsubscribeToken: string;
}): Promise<{ sent: boolean }> {
  const unsubUrl = newsletterUnsubscribeUrl(input.unsubscribeToken);
  const subject = "You are subscribed to Salanor updates";
  const text = [
    "Your subscription is confirmed.",
    "",
    "You will receive occasional notes on research, product releases, and governance topics.",
    "",
    "Unsubscribe:",
    unsubUrl,
    "",
    "— Salanor",
  ].join("\n");

  const bodyHtml = `<p ${P}>Your subscription is confirmed.</p>
<p ${P}>You will receive occasional notes on research, product releases, and governance topics.</p>
<p ${MUTED}><a href="${unsubUrl}" style="color:#43c2a9;text-decoration:underline;">Unsubscribe</a> from these emails anytime.</p>`;

  const html = newsletterEmailLayout({
    preheader: "Subscription confirmed",
    bodyHtml,
  });

  const result = await sendEmailViaResend({
    to: input.email,
    subject,
    text,
    html,
    headers: newsletterListMailHeaders(input.unsubscribeToken),
  });
  return { sent: result.sent };
}

export async function sendNewsletterCampaignEmail(input: {
  to: string;
  subject: string;
  previewText?: string | null;
  bodyHtml: string;
  bodyText: string;
  unsubscribeToken: string;
}): Promise<{ sent: boolean; providerId?: string }> {
  const unsubUrl = newsletterUnsubscribeUrl(input.unsubscribeToken);
  const text = [
    input.bodyText.trim(),
    "",
    "—",
    "Unsubscribe:",
    unsubUrl,
    "",
    `Salanor · ${SITE_ORIGIN}`,
  ].join("\n");

  const footerHtml = `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #30363d;font-size:13px;line-height:1.5;color:#8b949e;">
      <a href="${unsubUrl}" style="color:#43c2a9;text-decoration:underline;">Unsubscribe</a> from these emails.
    </p>`;

  const html = newsletterEmailLayout({
    preheader: input.previewText ?? undefined,
    bodyHtml: input.bodyHtml,
    footerHtml,
  });

  const result = await sendEmailViaResend({
    to: input.to,
    subject: input.subject,
    text,
    html,
    headers: newsletterListMailHeaders(input.unsubscribeToken),
  });
  return { sent: result.sent, providerId: result.id };
}
