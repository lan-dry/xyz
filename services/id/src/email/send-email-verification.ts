import { EmailDeliveryError, getInviteFromAddress, getResendApiKey } from "./email-delivery.js";

export type VerifyEmailInput = {
  to: string;
  verifyUrl: string;
};

export async function sendEmailVerificationEmail(
  input: VerifyEmailInput,
): Promise<void> {
  const from = getInviteFromAddress();
  const subject = "Verify your Salanor account";
  const bodyText = [
    "Welcome to Salanor Aegis.",
    "",
    "Confirm your email to access the console:",
    input.verifyUrl,
    "",
    "This link expires in 24 hours.",
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
      html: `<p>Welcome to Salanor Aegis.</p>
<p><a href="${input.verifyUrl}">Verify your email</a> to access the console.</p>
<p>This link expires in 24 hours.</p>`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[salanor-id] Resend verification failed:", response.status, errText);
    throw new EmailDeliveryError("email_send_failed", "Failed to send verification email");
  }
}
