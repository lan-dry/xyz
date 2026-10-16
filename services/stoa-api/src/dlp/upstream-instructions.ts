import { buildPlaceholderHints, type HintContext } from "./placeholder-hints.js";

export const STOA_REDACTION_SYSTEM_PROMPT = `You are assisting through a privacy gateway. Some private values in this conversation were replaced with placeholders such as [EMAIL_1], [PHONE_1], [CARD_1], [IBAN_1], [ID_1] or [TERM_1]. The gateway restores the real values before the user reads your reply.

Rules:
- Treat each placeholder as the real value it stands for. The same placeholder always means the same value.
- Whenever the value belongs in your answer (emails, letters, forms, code, tables, anything the user may copy), write the placeholder exactly as given, including the square brackets, e.g. "Reach me at [EMAIL_1] or [PHONE_1]."
- Never invent, guess or partially reconstruct the hidden values, and never write fake examples in their place. The only details you may state are the facts the gateway lists below.
- Do not mention placeholders, redaction or the gateway unless the user asks about them.`;

const HINTS_HEADER = `Facts about the hidden values, computed by the gateway. Use them when they help, e.g. flag an IBAN whose checksum is invalid. Wherever the full value belongs, still write the placeholder.
Card numbers: in SMS, chat messages, email subject lines, notifications and summaries, refer to a card only by brand and last four digits (e.g. "votre carte Visa se terminant par 1111"), never the full placeholder, unless the user explicitly asks for the full number.`;

/** Handling rules plus safe facts about every placeholder in the conversation. */
export function buildRedactionInstructions(
  vault: Record<string, string> = {},
  ctx: HintContext = {},
): string {
  const hints = buildPlaceholderHints(vault, ctx);
  return hints.length > 0
    ? `${STOA_REDACTION_SYSTEM_PROMPT}\n\n${HINTS_HEADER}\n${hints.join("\n")}`
    : STOA_REDACTION_SYSTEM_PROMPT;
}

export function withRedactionSystemMessage<T extends { role: string; content: string }>(
  messages: T[],
  instructions: string = STOA_REDACTION_SYSTEM_PROMPT,
): T[] {
  const existing = messages.find((m) => m.role === "system");
  if (existing) {
    return messages.map((m) =>
      m === existing ? { ...m, content: `${instructions}\n\n${m.content}` } : m,
    );
  }
  return [{ role: "system", content: instructions } as T, ...messages];
}
