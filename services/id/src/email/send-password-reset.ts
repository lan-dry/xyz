import { EmailDeliveryError, getInviteFromAddress, getResendApiKey } from "./email-delivery.js";

export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
): Promise<void> {
  const from = getInviteFromAddress();
  const subject = "Reset your Salanor password";
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
      html: `<p>You requested a password reset for your Salanor account.</p>
<p><a href="${input.resetUrl}">Reset your password</a></p>
<p>This link expires in 1 hour.</p>`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[salanor-id] Resend password reset failed:", response.status, errText);
    throw new EmailDeliveryError("email_send_failed", "Failed to send password reset email");
  }
}
