export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
): Promise<void> {
  const from =
    process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
  const subject = "Reset your Salanor password";
  const bodyText = [
    "You requested a password reset for your Salanor account.",
    "",
    `Reset your password:`,
    input.resetUrl,
    "",
    "This link expires in 1 hour. If you did not request this, ignore this email.",
  ].join("\n");

  console.log("\n[salanor-id] ── Password reset ─────────────────────────────");
  console.log(`  To:     ${input.to}`);
  console.log(`  Reset:  ${input.resetUrl}`);
  console.log("[salanor-id] ─────────────────────────────────────────────────\n");

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
    console.error("[salanor-id] Resend delivery failed:", response.status, errText);
    throw new Error("Failed to send password reset email");
  }
}
