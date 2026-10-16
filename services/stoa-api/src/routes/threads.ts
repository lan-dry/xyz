import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { containsEmbeddedPayload } from "../dlp/redact.js";
import { redactForUpstream } from "../dlp/detector.js";
import { openVault, sealVault } from "../dlp/vault-crypto.js";
import {
  buildRedactionInstructions,
  withRedactionSystemMessage,
} from "../dlp/upstream-instructions.js";
import { getOrgEmailDomains } from "../tenant/org-domains.js";
import {
  collectThreadVault,
  presentAssistantMessage,
  presentUserMessage,
  toClientMessage,
  upstreamFingerprint,
  type MessageRow,
} from "../dlp/message-presentation.js";
import { mergeVaults, rehydrateText } from "../dlp/rehydrate.js";
import { logAuditEvent } from "../audit/log.js";
import { completeChat, type ChatMessage } from "../llm/openai.js";
import {
  isModelAllowedForTenant,
  resolveDefaultModelId,
} from "../tenant/model-access.js";
import { getTenantSettings } from "../tenant/settings.js";
import { toUserFacingChatError } from "../llm/user-facing-chat-error.js";
import {
  deriveThreadTitleFromMessage,
  isDefaultThreadTitle,
} from "../threads/derive-title.js";
import { assertWithinQuotas, recordMessageUsage } from "../usage/quota.js";

async function loadAttachmentsForMessage(
  tenantId: string,
  userId: string,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) {
    return [];
  }
  const result = await getPool().query<{
    id: string;
    original_name: string;
    mime_type: string;
    byte_size: string;
    text_extract: string | null;
  }>(
    `SELECT id, original_name, mime_type, byte_size::text, text_extract
     FROM stoa_attachment
     WHERE tenant_id = $1 AND user_id = $2 AND id = ANY($3::uuid[]) AND scan_status = 'clean'`,
    [tenantId, userId, attachmentIds],
  );
  return result.rows;
}

/** Vault entries from user messages in the thread, optionally only up to a point in time. */
async function loadThreadVault(
  threadId: string,
  upTo?: Date,
): Promise<Record<string, string>> {
  const rows = await getPool().query<{ redaction_vault: string | null }>(
    `SELECT redaction_vault FROM stoa_message
     WHERE thread_id = $1 AND role = 'user' AND redaction_vault IS NOT NULL
       AND ($2::timestamptz IS NULL OR created_at <= $2)
     ORDER BY created_at ASC`,
    [threadId, upTo ?? null],
  );
  return collectThreadVault(rows.rows);
}

/** Conversation as the provider sees it: placeholders only, plus handling instructions. */
async function loadUpstreamHistory(
  tenantId: string,
  threadId: string,
): Promise<ChatMessage[]> {
  const history = await getPool().query<{
    role: string;
    content: string;
    redaction_count: number;
  }>(
    `SELECT role, content, redaction_count FROM stoa_message
     WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  const messages: ChatMessage[] = history.rows.map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
  if (!history.rows.some((m) => m.redaction_count > 0)) {
    return messages;
  }
  const [vault, orgDomains] = await Promise.all([
    loadThreadVault(threadId),
    getOrgEmailDomains(tenantId),
  ]);
  return withRedactionSystemMessage(
    messages,
    buildRedactionInstructions(vault, { orgDomains }),
  );
}

export const threadRoutes = new Hono();

threadRoutes.get("/threads", async (c) => {
  const { tenantId, userId } = c.get("stoa");
  const result = await getPool().query<{
    id: string;
    title: string;
    model_id: string;
    updated_at: Date;
    message_count: number;
    first_vault: string | null;
  }>(
    `SELECT t.id, t.title, t.model_id, t.updated_at,
            (SELECT COUNT(*)::int FROM stoa_message m WHERE m.thread_id = t.id) AS message_count,
            (SELECT m.redaction_vault FROM stoa_message m
              WHERE m.thread_id = t.id AND m.role = 'user'
              ORDER BY m.created_at ASC LIMIT 1) AS first_vault
     FROM stoa_thread t
     WHERE t.tenant_id = $1 AND t.user_id = $2
     ORDER BY t.updated_at DESC
     LIMIT 100`,
    [tenantId, userId],
  );
  return c.json({
    threads: result.rows.map((row) => ({
      id: row.id,
      title: rehydrateText(row.title, openVault(row.first_vault)),
      modelId: row.model_id,
      updatedAt: row.updated_at.toISOString(),
      messageCount: row.message_count,
    })),
  });
});

threadRoutes.post("/threads", async (c) => {
  const { tenantId, userId } = c.get("stoa");
  const body = (await c.req
    .json<{ title?: string; modelId?: string; forceNew?: boolean }>()
    .catch(() => null)) ?? {};
  const title = body.title?.trim() || "New chat";
  const defaultModel = (await resolveDefaultModelId(tenantId)) ?? "";
  const modelId = body.modelId?.trim() || defaultModel;
  if (!modelId || !(await isModelAllowedForTenant(tenantId, modelId))) {
    return c.json({ error: "This model isn't available." }, 400);
  }

  if (body.forceNew !== true) {
    const empty = await getPool().query<{
      id: string;
      title: string;
      model_id: string;
    }>(
      `SELECT t.id, t.title, t.model_id
       FROM stoa_thread t
       WHERE t.tenant_id = $1 AND t.user_id = $2
         AND NOT EXISTS (SELECT 1 FROM stoa_message m WHERE m.thread_id = t.id)
       ORDER BY t.updated_at DESC
       LIMIT 1`,
      [tenantId, userId],
    );
    const row = empty.rows[0];
    if (row) {
      if (row.model_id !== modelId) {
        await getPool().query(
          `UPDATE stoa_thread SET model_id = $2, updated_at = now() WHERE id = $1`,
          [row.id, modelId],
        );
      }
      return c.json(
        { id: row.id, title: row.title, modelId, reused: true },
        200,
      );
    }
  }

  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO stoa_thread (tenant_id, user_id, title, model_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, userId, title, modelId],
  );
  const id = inserted.rows[0]?.id;
  if (!id) {
    return c.json({ error: "Couldn't start a new chat. Try again." }, 500);
  }
  return c.json({ id, title, modelId }, 201);
});

threadRoutes.patch("/threads/:threadId", async (c) => {
  const { tenantId, userId } = c.get("stoa");
  const threadId = c.req.param("threadId");
  const body = await c.req.json<{ modelId?: string; title?: string }>();
  if (body.modelId === undefined && body.title === undefined) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const existing = await getPool().query<{
    id: string;
    title: string;
    model_id: string;
  }>(
    `SELECT id, title, model_id FROM stoa_thread
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [threadId, tenantId, userId],
  );
  const row = existing.rows[0];
  if (!row) {
    return c.json({ error: "Chat not found." }, 404);
  }

  let nextTitle = row.title;
  let nextModel = row.model_id;

  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    if (!trimmed || trimmed.length > 120) {
      return c.json({ error: "Title must be between 1 and 120 characters" }, 400);
    }
    nextTitle = trimmed;
  }
  if (body.modelId !== undefined) {
    const modelId = body.modelId.trim();
    if (!modelId || !(await isModelAllowedForTenant(tenantId, modelId))) {
      return c.json({ error: "This model isn't available." }, 400);
    }
    nextModel = modelId;
  }

  await getPool().query(
    `UPDATE stoa_thread SET title = $4, model_id = $5, updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [threadId, tenantId, userId, nextTitle, nextModel],
  );
  return c.json({ id: threadId, title: nextTitle, modelId: nextModel });
});

threadRoutes.delete("/threads/:threadId", async (c) => {
  const { tenantId, userId } = c.get("stoa");
  const threadId = c.req.param("threadId");
  const deleted = await getPool().query<{ id: string }>(
    `DELETE FROM stoa_thread
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     RETURNING id`,
    [threadId, tenantId, userId],
  );
  if (!deleted.rows[0]) {
    return c.json({ error: "Chat not found." }, 404);
  }
  return c.json({ ok: true });
});

threadRoutes.get("/threads/:threadId/messages", async (c) => {
  const { tenantId, userId } = c.get("stoa");
  const threadId = c.req.param("threadId");
  const thread = await getPool().query(
    `SELECT id FROM stoa_thread WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [threadId, tenantId, userId],
  );
  if (!thread.rows[0]) {
    return c.json({ error: "Chat not found." }, 404);
  }

  const messages = await getPool().query<MessageRow>(
    `SELECT id, role, content, content_display, redaction_count,
            redaction_vault, redaction_manifest, created_at
     FROM stoa_message WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  const threadVault = collectThreadVault(messages.rows);

  const ids = messages.rows.map((m) => m.id);
  const attRows =
    ids.length === 0
      ? []
      : (
          await getPool().query<{
            message_id: string;
            attachment_id: string;
            original_name: string;
            mime_type: string;
            byte_size: string;
          }>(
            `SELECT ma.message_id, a.id AS attachment_id, a.original_name, a.mime_type, a.byte_size::text
             FROM stoa_message_attachment ma
             JOIN stoa_attachment a ON a.id = ma.attachment_id
             WHERE ma.message_id = ANY($1::uuid[])`,
            [ids],
          )
        ).rows;
  const attByMessage = new Map<string, typeof attRows>();
  for (const row of attRows) {
    const list = attByMessage.get(row.message_id) ?? [];
    list.push(row);
    attByMessage.set(row.message_id, list);
  }

  return c.json({
    messages: messages.rows.map((m) => ({
      ...toClientMessage(m, threadVault),
      attachments: (attByMessage.get(m.id) ?? []).map((a) => ({
        id: a.attachment_id,
        originalName: a.original_name,
        mimeType: a.mime_type,
        byteSize: Number(a.byte_size),
      })),
    })),
  });
});

threadRoutes.post("/threads/:threadId/messages", async (c) => {
  const ctx = c.get("stoa");
  const threadId = c.req.param("threadId");
  const body = await c.req.json<{ content?: string; attachmentIds?: string[] }>();
  const rawContent = body.content?.trim() ?? "";
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!rawContent && attachmentIds.length === 0) {
    return c.json({ error: "Type a message." }, 400);
  }

  const threadRow = await getPool().query<{ model_id: string; title: string }>(
    `SELECT model_id, title FROM stoa_thread
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [threadId, ctx.tenantId, ctx.userId],
  );
  const thread = threadRow.rows[0];
  if (!thread) {
    return c.json({ error: "Chat not found." }, 404);
  }

  const tenantSettings = await getTenantSettings(ctx.tenantId);

  const quota = await assertWithinQuotas(
    ctx.tenantId,
    ctx.userId,
    tenantSettings.quotas,
  );
  if (!quota.ok) {
    return c.json({ error: quota.reason }, 429);
  }

  if (attachmentIds.length > 0 && !tenantSettings.uploads.allowAttachments) {
    return c.json({ error: "File uploads are turned off." }, 403);
  }

  const attachments = await loadAttachmentsForMessage(
    ctx.tenantId,
    ctx.userId,
    attachmentIds,
  );
  if (attachmentIds.length > 0 && attachments.length !== attachmentIds.length) {
    return c.json({ error: "A file couldn't be attached." }, 400);
  }

  if (
    !tenantSettings.uploads.allowAttachments &&
    containsEmbeddedPayload(rawContent)
  ) {
    return c.json(
      { error: "Pasted files aren't allowed." },
      400,
    );
  }
  const priorVault = await loadThreadVault(threadId);
  const redacted = await redactForUpstream(rawContent, {
    profile: tenantSettings.dlp.profile,
    customTerms: tenantSettings.dlp.customTerms,
    customPatterns: tenantSettings.dlp.customPatterns,
    priorVault,
  });
  const safeContent = redacted.text;
  const redactionCount = redacted.redactionCount;
  const sealedVault = sealVault(redacted.vault);
  const redactionManifest = redacted.manifest;
  const threadVault = mergeVaults([priorVault, redacted.vault]);

  let attachmentBlock = "";
  for (const att of attachments) {
    attachmentBlock += `\n\n[Attachment: ${att.original_name} (${att.mime_type}, ${att.byte_size} bytes)]`;
    if (att.text_extract) {
      attachmentBlock += `\nExtract (redacted):\n${att.text_extract.slice(0, 8000)}`;
    }
  }
  const messageForStore = safeContent + (attachmentBlock ? attachmentBlock : "");
  const messageForDisplay = safeContent;
  const userInsert = await getPool().query<{ id: string; created_at: Date }>(
    `INSERT INTO stoa_message (
       thread_id, role, content, content_display, redaction_count,
       redaction_vault, redaction_manifest
     )
     VALUES ($1, 'user', $2, $3, $4, $5, $6::jsonb)
     RETURNING id, created_at`,
    [
      threadId,
      messageForStore,
      messageForDisplay,
      redactionCount,
      sealedVault,
      JSON.stringify(redactionManifest),
    ],
  );
  const userMessageId = userInsert.rows[0]?.id;
  const userMessageCreatedAt = userInsert.rows[0]?.created_at;
  if (userMessageId && attachments.length > 0) {
    for (const att of attachments) {
      await getPool().query(
        `INSERT INTO stoa_message_attachment (message_id, attachment_id) VALUES ($1, $2)`,
        [userMessageId, att.id],
      );
    }
  }

  let threadTitle = thread.title;
  if (isDefaultThreadTitle(thread.title) && safeContent.length > 0) {
    threadTitle = deriveThreadTitleFromMessage(safeContent);
    await getPool().query(
      `UPDATE stoa_thread SET title = $2, updated_at = now() WHERE id = $1`,
      [threadId, threadTitle],
    );
  }

  const chatMessages = await loadUpstreamHistory(ctx.tenantId, threadId);
  const clientUserMessage = {
    ...presentUserMessage({
      id: userMessageId ?? "",
      upstream: messageForStore,
      display: messageForDisplay,
      redactionCount,
      manifest: redactionManifest,
      createdAt: userMessageCreatedAt ?? new Date(),
      threadVault,
    }),
    attachments: attachments.map((a) => ({
      id: a.id,
      originalName: a.original_name,
      mimeType: a.mime_type,
      byteSize: Number(a.byte_size),
    })),
  };
  const titleForClient = rehydrateText(threadTitle, threadVault);

  let assistantText: string;
  try {
    assistantText = await completeChat(ctx.tenantId, thread.model_id, chatMessages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        error: toUserFacingChatError(message, thread.model_id),
        userMessage: userMessageId ? clientUserMessage : undefined,
        threadTitle: titleForClient,
      },
      502,
    );
  }

  const assistantInsert = await getPool().query<{ id: string; created_at: Date }>(
    `INSERT INTO stoa_message (thread_id, role, content, redaction_count)
     VALUES ($1, 'assistant', $2, 0) RETURNING id, created_at`,
    [threadId, assistantText],
  );
  const assistantRow = assistantInsert.rows[0];

  await getPool().query(
    `UPDATE stoa_thread SET updated_at = now() WHERE id = $1`,
    [threadId],
  );

  await recordMessageUsage(ctx.tenantId, ctx.userId);

  const assistantMessage = presentAssistantMessage({
    id: assistantRow?.id ?? "",
    upstream: assistantText,
    createdAt: assistantRow?.created_at ?? new Date(),
    threadVault,
  });

  await logAuditEvent({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    threadId,
    eventType: "message.completed",
    metadata: {
      modelId: thread.model_id,
      redactionCount,
      redactionManifest,
      upstreamSha256: upstreamFingerprint(messageForStore),
      valuesRestoredInReply: assistantMessage.restoredCount ?? 0,
      attachmentCount: attachments.length,
      userMessageId,
      assistantMessageId: assistantRow?.id,
    },
  });

  return c.json({
    userMessage: clientUserMessage,
    assistantMessage,
    threadTitle: titleForClient,
  });
});

threadRoutes.patch("/threads/:threadId/messages/:messageId", async (c) => {
  const ctx = c.get("stoa");
  const threadId = c.req.param("threadId");
  const messageId = c.req.param("messageId");
  const body = await c.req.json<{ content?: string }>();
  const rawContent = body.content?.trim() ?? "";
  if (!rawContent) {
    return c.json({ error: "Type a message." }, 400);
  }

  const threadRow = await getPool().query<{ model_id: string; title: string }>(
    `SELECT model_id, title FROM stoa_thread
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [threadId, ctx.tenantId, ctx.userId],
  );
  const thread = threadRow.rows[0];
  if (!thread) {
    return c.json({ error: "Chat not found." }, 404);
  }

  const msgRow = await getPool().query<{
    id: string;
    role: string;
    created_at: Date;
  }>(
    `SELECT id, role, created_at FROM stoa_message
     WHERE id = $1 AND thread_id = $2`,
    [messageId, threadId],
  );
  const msg = msgRow.rows[0];
  if (!msg || msg.role !== "user") {
    return c.json({ error: "Only your own messages can be edited." }, 400);
  }

  const tenantSettings = await getTenantSettings(ctx.tenantId);
  const quota = await assertWithinQuotas(
    ctx.tenantId,
    ctx.userId,
    tenantSettings.quotas,
  );
  if (!quota.ok) {
    return c.json({ error: quota.reason }, 429);
  }

  const priorVault = await loadThreadVault(threadId, msg.created_at);
  const redacted = await redactForUpstream(rawContent, {
    profile: tenantSettings.dlp.profile,
    customTerms: tenantSettings.dlp.customTerms,
    customPatterns: tenantSettings.dlp.customPatterns,
    priorVault,
  });

  await getPool().query(
    `DELETE FROM stoa_message
     WHERE thread_id = $1 AND created_at > $2 AND id <> $3`,
    [threadId, msg.created_at, messageId],
  );
  const safeContent = redacted.text;
  const redactionCount = redacted.redactionCount;
  const redactionManifest = redacted.manifest;
  const threadVault = mergeVaults([priorVault, redacted.vault]);

  await getPool().query(
    `UPDATE stoa_message
     SET content = $2, content_display = $3, redaction_count = $4,
         redaction_vault = $5, redaction_manifest = $6::jsonb
     WHERE id = $1`,
    [
      messageId,
      safeContent,
      safeContent,
      redactionCount,
      sealVault(redacted.vault),
      JSON.stringify(redactionManifest),
    ],
  );

  let threadTitle = thread.title;
  if (isDefaultThreadTitle(thread.title)) {
    threadTitle = deriveThreadTitleFromMessage(safeContent);
    await getPool().query(
      `UPDATE stoa_thread SET title = $2, updated_at = now() WHERE id = $1`,
      [threadId, threadTitle],
    );
  }
  const titleForClient = rehydrateText(threadTitle, threadVault);

  const userMessage = presentUserMessage({
    id: messageId,
    upstream: safeContent,
    display: rawContent,
    redactionCount,
    manifest: redactionManifest,
    createdAt: msg.created_at,
    threadVault,
  });

  const chatMessages = await loadUpstreamHistory(ctx.tenantId, threadId);

  let assistantText: string;
  try {
    assistantText = await completeChat(ctx.tenantId, thread.model_id, chatMessages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        error: toUserFacingChatError(message, thread.model_id),
        userMessage,
        threadTitle: titleForClient,
      },
      502,
    );
  }

  const assistantInsert = await getPool().query<{ id: string; created_at: Date }>(
    `INSERT INTO stoa_message (thread_id, role, content, redaction_count)
     VALUES ($1, 'assistant', $2, 0) RETURNING id, created_at`,
    [threadId, assistantText],
  );
  const assistantRow = assistantInsert.rows[0];

  await recordMessageUsage(ctx.tenantId, ctx.userId);

  const assistantMessage = presentAssistantMessage({
    id: assistantRow?.id ?? "",
    upstream: assistantText,
    createdAt: assistantRow?.created_at ?? new Date(),
    threadVault,
  });

  await logAuditEvent({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    threadId,
    eventType: "message.edited",
    metadata: {
      modelId: thread.model_id,
      redactionCount,
      redactionManifest,
      upstreamSha256: upstreamFingerprint(safeContent),
      valuesRestoredInReply: assistantMessage.restoredCount ?? 0,
      userMessageId: messageId,
      assistantMessageId: assistantRow?.id,
    },
  });

  return c.json({
    userMessage,
    assistantMessage,
    threadTitle: titleForClient,
  });
});
