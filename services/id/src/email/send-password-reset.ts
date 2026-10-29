import { buildBrandedEmailHtml } from "./branded-email.js";
import { sendTransactionalEmail } from "./email-delivery.js";

export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  fromAddress?: string;
  replyTo?: string;
  organizationId?: string | null;
};

export function buildPasswordResetEmailHtml(resetUrl: string): string {
  return buildBrandedEmailHtml({
    title: "Reset your Salanor password",
    heading: "Reset your password",
    bodyHtml: `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">We received a request to reset the password for your Salanor account. Use the button below to choose a new password.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5c6660;">If you did not request this, no action is needed. Your current password stays unchanged.</p>`,
    ctaLabel: "Reset password",
    ctaUrl: resetUrl,
    footerNote: "This link expires in 1 hour for your security.",
  });
}

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
): Promise<void> {
  const subject = "Reset your Salanor password";
  const html = buildPasswordResetEmailHtml(input.resetUrl);
  const bodyText = [
    "You requested a password reset for your Salanor account.",
    "",
    "Reset your password:",
    input.resetUrl,
    "",
    "This link expires in 1 hour. If you did not request this, ignore this email.",
  ].join("\n");

  await sendTransactionalEmail({
    to: input.to,
    subject,
    text: bodyText,
    html,
    fromAddress: input.fromAddress,
    replyTo: input.replyTo,
    organizationId: input.organizationId,
  });
}
