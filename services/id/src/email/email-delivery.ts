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
  return process.env.INVITE_EMAIL_FROM ?? "Salanor <invites@notifications.salanor.com>";
}
