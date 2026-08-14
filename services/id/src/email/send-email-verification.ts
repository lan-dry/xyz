import { buildBrandedEmailHtml } from "./branded-email.js";
import { EmailDeliveryError, getInviteFromAddress, getResendApiKey } from "./email-delivery.js";

export type VerifyEmailInput = {
  to: string;
  verifyUrl: string;
};

export function buildVerifyEmailHtml(verifyUrl: string): string {
  return buildBrandedEmailHtml({
    title: "Verify your Salanor account",
    heading: "Verify your email",
    bodyHtml: `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">Welcome to <strong>Salanor Aegis</strong>. Confirm this email address to activate your organization admin account and open the console.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5c6660;">After verification you can invite teammates, issue API keys, and start recording signed AI activity.</p>`,
    ctaLabel: "Verify email address",
    ctaUrl: verifyUrl,
    footerNote:
      "This link expires in 24 hours. If you did not create a Salanor account, you can ignore this email.",
  });
}

export async function sendEmailVerificationEmail(
  input: VerifyEmailInput,
): Promise<void> {
  const from = getInviteFromAddress();
  const subject = "Verify your Salanor account";
  const html = buildVerifyEmailHtml(input.verifyUrl);
  const bodyText = [
    "Welcome to Salanor Aegis.",
    "",
    "Confirm your email to access the console:",
    input.verifyUrl,
    "",
    "This link expires in 24 hours.",
    "If you did not create a Salanor account, ignore this email.",
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
    console.error("[salanor-id] Resend verification failed:", response.status, errText);
    throw new EmailDeliveryError("email_send_failed", "Failed to send verification email");
  }
}
