import { buildBrandedEmailHtml, escapeHtml } from "./branded-email.js";
import { sendTransactionalEmail } from "./email-delivery.js";

export type AccessRequestRejectionEmailInput = {
  to: string;
  company: string;
  note?: string | null;
  fromAddress?: string;
  replyTo?: string;
};

const MARKETING_URL = "https://www.salanor.com/aegis";

export function buildAccessRequestRejectionEmailHtml(input: {
  company: string;
  note?: string | null;
}): string {
  const note = (input.note ?? "").trim();
  const noteHtml = note
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5c6660;">${escapeHtml(note)}</p>`
    : "";
  return buildBrandedEmailHtml({
    title: "Aegis sandbox request update",
    heading: "Sandbox request update",
    bodyHtml: `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">Thank you for your interest in an Aegis sandbox for <strong>${escapeHtml(input.company)}</strong>.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#3d4540;">We are not able to offer a sandbox for this request right now.</p>${noteHtml}`,
    ctaLabel: "Learn about Aegis",
    ctaUrl: MARKETING_URL,
    footerNote: "You can request access again later if your use case changes.",
  });
}

export async function sendAccessRequestRejectionEmail(
  input: AccessRequestRejectionEmailInput,
): Promise<void> {
  const note = (input.note ?? "").trim();
  const subject = "Aegis sandbox request update";
  const html = buildAccessRequestRejectionEmailHtml({
    company: input.company,
    note,
  });
  const bodyText = [
    `Thank you for your interest in an Aegis sandbox for ${input.company}.`,
    "",
    "We are not able to offer a sandbox for this request right now.",
    note ? "" : null,
    note || null,
    "",
    `Learn about Aegis: ${MARKETING_URL}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  await sendTransactionalEmail({
    to: input.to,
    subject,
    text: bodyText,
    html,
    fromAddress: input.fromAddress,
    replyTo: input.replyTo,
  });
}
