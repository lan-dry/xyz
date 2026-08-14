import { buildBrandedEmailHtml } from "./branded-email.js";
import { EmailDeliveryError, getInviteFromAddress, getResendApiKey } from "./email-delivery.js";

export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
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
  const from = getInviteFromAddress();
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

  const apiKey = getResendApiKey();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      text: bodyText,
      html,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[salanor-id] Resend password reset failed:", response.status, errText);
    throw new EmailDeliveryError("email_send_failed", "Failed to send password reset email");
  }
}
