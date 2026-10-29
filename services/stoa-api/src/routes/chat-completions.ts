import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { redactForUpstream } from "../dlp/detector.js";
import { rehydrateText } from "../dlp/rehydrate.js";
import {
  buildRedactionInstructions,
  withRedactionSystemMessage,
} from "../dlp/upstream-instructions.js";
import { getOrgEmailDomains } from "../tenant/org-domains.js";
import { upstreamFingerprint } from "../dlp/message-presentation.js";
import type { RedactionManifestEntry } from "../dlp/manifest.js";
import {
  isModelAllowedForTenant,
  resolveDefaultModelId,
} from "../tenant/model-access.js";
import { getTenantSettings } from "../tenant/settings.js";
import { completeChat, type ChatMessage } from "../llm/openai.js";
import { logAuditEvent } from "../audit/log.js";
import { assertWithinQuotas, recordMessageUsage } from "../usage/quota.js";

/** OpenAI-compatible endpoint for internal systems. Stateless: no thread is stored. */
export const chatCompletionRoutes = new Hono();

chatCompletionRoutes.post("/chat/completions", async (c) => {
  const ctx = c.get("stoa");
  const body = await c.req.json<{
    model?: string;
    messages?: { role: string; content: string }[];
  }>();

  const settings = await getTenantSettings(ctx.tenantId);
  const defaultModel = (await resolveDefaultModelId(ctx.tenantId)) ?? "";
  const model = body.model?.trim() || defaultModel;
  if (!model || !(await isModelAllowedForTenant(ctx.tenantId, model))) {
    return c.json({ error: "Model not allowed" }, 400);
  }
  const incoming = body.messages ?? [];
  if (incoming.length === 0) {
    return c.json({ error: "messages required" }, 400);
  }
  const quota = await assertWithinQuotas(ctx.tenantId, ctx.userId, settings.quotas);
  if (!quota.ok) {
    return c.json({ error: quota.reason }, 429);
  }

  // Clients resend earlier replies with real values restored, so every role is redacted.
  let vault: Record<string, string> = {};
  let totalRedactions = 0;
  const manifest = new Map<string, RedactionManifestEntry>();
  let messages: ChatMessage[] = [];
  for (const m of incoming) {
    const role = (
      m.role === "assistant" || m.role === "system" ? m.role : "user"
    ) as ChatMessage["role"];
    const redacted = await redactForUpstream(String(m.content ?? ""), {
      profile: settings.dlp.profile,
      customTerms: settings.dlp.customTerms,
      customPatterns: settings.dlp.customPatterns,
      priorVault: vault,
    });
    vault = { ...vault, ...redacted.vault };
    totalRedactions += redacted.redactionCount;
    for (const entry of redacted.manifest) {
      const prev = manifest.get(entry.group);
      manifest.set(entry.group, { ...entry, count: (prev?.count ?? 0) + entry.count });
    }
    messages.push({ role, content: redacted.text });
  }
  if (totalRedactions > 0) {
    messages = withRedactionSystemMessage(
      messages,
      buildRedactionInstructions(vault, {
        orgDomains: await getOrgEmailDomains(ctx.tenantId),
      }),
    );
  }

  let upstreamReply: string;
  try {
    upstreamReply = await completeChat(ctx.tenantId, model, messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 502);
  }
  const content = rehydrateText(upstreamReply, vault);
  try {
    await recordMessageUsage(ctx.tenantId, ctx.userId);
  } catch {
    // Don't fail a successful completion if usage accounting is unavailable.
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  await logAuditEvent({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    eventType: "gateway.completion",
    metadata: {
      model,
      authMode: ctx.authMode,
      credentialId: ctx.gatewayCredentialId ?? null,
      redactionCount: totalRedactions,
      redactionManifest: [...manifest.values()],
      upstreamSha256: lastUser ? upstreamFingerprint(lastUser.content) : null,
      messageCount: messages.length,
    },
  });

  return c.json({
    id: `stoa-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
  });
});
