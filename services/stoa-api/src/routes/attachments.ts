import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { scanAttachment } from "../attachments/scan.js";
import {
  persistRedactedPng,
  persistUpload,
  uploadRoot,
} from "../attachments/storage.js";
import { getPool } from "../db/pool.js";
import { getTenantSettings } from "../tenant/settings.js";
import { assertWithinQuotas, recordAttachmentBytes } from "../usage/quota.js";

export const attachmentRoutes = new Hono();

attachmentRoutes.post("/attachments", async (c) => {
  const ctx = c.get("stoa");
  const settings = await getTenantSettings(ctx.tenantId);
  if (!settings.uploads.allowAttachments) {
    return c.json({ error: "File uploads are turned off." }, 403);
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === "string") {
    return c.json({ error: "Choose a file." }, 400);
  }

  const blob = file as File;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const maxBytes = settings.uploads.maxFileMb * 1024 * 1024;

  const quota = await assertWithinQuotas(
    ctx.tenantId,
    ctx.userId,
    settings.quotas,
    buffer.length,
  );
  if (!quota.ok) {
    return c.json({ error: quota.reason }, 429);
  }

  const scan = await scanAttachment({
    buffer,
    declaredMime: blob.type || "application/octet-stream",
    originalName: blob.name || "upload",
    allowList: settings.uploads.allowedMimeTypes,
    dlpProfile: settings.dlp.profile,
    maxBytes,
  });

  if (scan.status === "blocked") {
    return c.json({ error: scan.detail }, 400);
  }

  const stored = await persistUpload(ctx.tenantId, buffer);
  let redactedRelative: string | null = null;
  if (scan.redactedImage) {
    redactedRelative = await persistRedactedPng(
      ctx.tenantId,
      stored.id,
      scan.redactedImage,
    );
  }

  const inserted = await getPool().query<{
    id: string;
    created_at: Date;
  }>(
    `INSERT INTO stoa_attachment
       (tenant_id, user_id, original_name, mime_type, byte_size, storage_path,
        scan_status, scan_detail, text_extract, redacted_storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, 'clean', $7, $8, $9)
     RETURNING id, created_at`,
    [
      ctx.tenantId,
      ctx.userId,
      blob.name || "upload",
      scan.mimeType,
      buffer.length,
      stored.relativePath,
      scan.detail,
      scan.textExtract,
      redactedRelative,
    ],
  );
  const row = inserted.rows[0];
  if (!row) {
    return c.json({ error: "Upload failed. Try again." }, 500);
  }

  await recordAttachmentBytes(ctx.tenantId, ctx.userId, buffer.length);

  const textExtract = (scan.textExtract ?? "").trim();
  return c.json(
    {
      attachment: {
        id: row.id,
        originalName: blob.name || "upload",
        mimeType: scan.mimeType,
        byteSize: buffer.length,
        scanStatus: "clean",
        textExtractAvailable: Boolean(textExtract),
        readyForModel: Boolean(textExtract),
        hasRedactedPreview: Boolean(redactedRelative),
        /** Protected payload the model will receive (redacted text only). */
        textExtract: textExtract || null,
        scanDetail: scan.detail,
        createdAt: row.created_at.toISOString(),
      },
    },
    201,
  );
});

/** What the model sees for this file — redacted extract (+ preview meta). Owner only. */
attachmentRoutes.get("/attachments/:attachmentId/protected", async (c) => {
  const ctx = c.get("stoa");
  const attachmentId = c.req.param("attachmentId");
  const row = await getPool().query<{
    original_name: string;
    mime_type: string;
    byte_size: string;
    scan_status: string;
    scan_detail: string | null;
    text_extract: string | null;
    redacted_storage_path: string | null;
  }>(
    `SELECT original_name, mime_type, byte_size::text, scan_status, scan_detail,
            text_extract, redacted_storage_path
     FROM stoa_attachment
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [attachmentId, ctx.tenantId, ctx.userId],
  );
  const att = row.rows[0];
  if (!att || att.scan_status !== "clean") {
    return c.json({ error: "File not found." }, 404);
  }
  const textExtract = (att.text_extract ?? "").trim();
  return c.json({
    protected: {
      attachmentId,
      originalName: att.original_name,
      mimeType: att.mime_type,
      byteSize: Number(att.byte_size),
      scanDetail: att.scan_detail,
      textExtract: textExtract || null,
      hasRedactedPreview: Boolean(att.redacted_storage_path),
      modelReceives: "redacted_text_only" as const,
    },
  });
});

/** Cleaned black-box PNG preview (never the original upload). Owner only. */
attachmentRoutes.get(
  "/attachments/:attachmentId/redacted-preview",
  async (c) => {
    const ctx = c.get("stoa");
    const attachmentId = c.req.param("attachmentId");
    const row = await getPool().query<{
      scan_status: string;
      redacted_storage_path: string | null;
      original_name: string;
    }>(
      `SELECT scan_status, redacted_storage_path, original_name
       FROM stoa_attachment
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [attachmentId, ctx.tenantId, ctx.userId],
    );
    const att = row.rows[0];
    if (!att || att.scan_status !== "clean" || !att.redacted_storage_path) {
      return c.json({ error: "Protected preview not available." }, 404);
    }
    const data = await readFile(
      path.join(uploadRoot(), att.redacted_storage_path),
    );
    const safeName = att.original_name.replace(/"/g, "").replace(/\.[^.]+$/, "");
    return new Response(data, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${safeName || "document"}.protected.png"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  },
);

attachmentRoutes.get("/attachments/:attachmentId", async (c) => {
  const ctx = c.get("stoa");
  const attachmentId = c.req.param("attachmentId");
  const row = await getPool().query<{
    storage_path: string;
    mime_type: string;
    original_name: string;
    scan_status: string;
  }>(
    `SELECT storage_path, mime_type, original_name, scan_status
     FROM stoa_attachment
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [attachmentId, ctx.tenantId, ctx.userId],
  );
  const att = row.rows[0];
  if (!att || att.scan_status !== "clean") {
    return c.json({ error: "File not found." }, 404);
  }
  const fullPath = path.join(uploadRoot(), att.storage_path);
  const data = await readFile(fullPath);
  return new Response(data, {
    headers: {
      "Content-Type": att.mime_type,
      "Content-Disposition": `attachment; filename="${att.original_name.replace(/"/g, "")}"`,
    },
  });
});
