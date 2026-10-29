import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function consoleOrigin(): string {
  return (
    process.env.CONSOLE_PUBLIC_URL?.trim() ||
    process.env.CONSOLE_ORIGIN?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export const shareRoutes = new Hono<{ Variables: ConsoleVariables }>();

/** Create an expiring read-only share link for a sealed receipt. */
shareRoutes.post(
  "/events/:eventId/share",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const eventId = c.req.param("eventId")?.trim();
    if (!eventId) {
      return c.json({ error: "eventId required" }, 422);
    }

    let body: { hours?: number } = {};
    try {
      if (c.req.header("content-type")?.includes("application/json")) {
        body = await c.req.json();
      }
    } catch {
      return c.json({ error: "Invalid JSON" }, 422);
    }

    const hours = Math.min(720, Math.max(1, Number(body.hours) || 72));
    const expiresAt = new Date(Date.now() + hours * 3_600_000);

    const client = await getPool().connect();
    try {
      const event = await client.query<{ event_id: string }>(
        `SELECT event_id FROM event
         WHERE organization_id = $1 AND event_id = $2
         LIMIT 1`,
        [session.organizationId, eventId],
      );
      if (!event.rows[0]) {
        return c.json({ error: "Event not found" }, 404);
      }

      const token = randomBytes(24).toString("hex");
      const shareId = `shr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

      await client.query(
        `INSERT INTO receipt_share_token (
           share_id, organization_id, event_id, token_hash, expires_at, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          shareId,
          session.organizationId,
          eventId,
          hashToken(token),
          expiresAt,
          session.userId,
        ],
      );

      await auditFromConsoleSession(client, session, {
        action: "receipt.share_created",
        resourceType: "receipt_share",
        resourceId: shareId,
        metadata: { event_id: eventId, hours, expires_at: expiresAt.toISOString() },
      });

      return c.json(
        {
          share: {
            share_id: shareId,
            event_id: eventId,
            expires_at: expiresAt.toISOString(),
            hours,
            share_url: `${consoleOrigin()}/share/${token}`,
            /** Shown once; store offline. */
            token,
          },
        },
        201,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("receipt_share_token") ||
        message.includes("does not exist")
      ) {
        return c.json(
          {
            error:
              "Share links require migration 011. Run: pnpm --filter aegis-api db:migrate",
          },
          503,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

shareRoutes.get(
  "/events/:eventId/shares",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const eventId = c.req.param("eventId")?.trim();
    if (!eventId) {
      return c.json({ error: "eventId required" }, 422);
    }

    try {
      const rows = await getPool().query<{
        share_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        created_at: Date;
        access_count: number;
        last_accessed_at: Date | null;
      }>(
        `SELECT share_id, expires_at, revoked_at, created_at, access_count, last_accessed_at
         FROM receipt_share_token
         WHERE organization_id = $1 AND event_id = $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [session.organizationId, eventId],
      );

      return c.json({
        shares: rows.rows.map((r) => ({
          share_id: r.share_id,
          expires_at: r.expires_at.toISOString(),
          revoked_at: r.revoked_at?.toISOString() ?? null,
          created_at: r.created_at.toISOString(),
          access_count: r.access_count,
          last_accessed_at: r.last_accessed_at?.toISOString() ?? null,
          active: !r.revoked_at && r.expires_at > new Date(),
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("receipt_share_token") ||
        message.includes("does not exist")
      ) {
        return c.json({ shares: [], error: "Migration 011 required" }, 503);
      }
      throw error;
    }
  },
);

shareRoutes.post(
  "/share/:shareId/revoke",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const shareId = c.req.param("shareId")?.trim();
    if (!shareId) {
      return c.json({ error: "shareId required" }, 422);
    }

    const result = await getPool().query<{ share_id: string }>(
      `UPDATE receipt_share_token
       SET revoked_at = now()
       WHERE organization_id = $1 AND share_id = $2 AND revoked_at IS NULL
       RETURNING share_id`,
      [session.organizationId, shareId],
    );
    if (!result.rows[0]) {
      return c.json({ error: "Not found or already revoked" }, 404);
    }

    await auditFromConsoleSession(getPool(), session, {
      action: "receipt.share_revoked",
      resourceType: "receipt_share",
      resourceId: shareId,
    });

    return c.json({ ok: true, share_id: shareId });
  },
);
