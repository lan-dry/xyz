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

export const auditorRoutes = new Hono<{ Variables: ConsoleVariables }>();

auditorRoutes.get("/auditor/invites", requireConsoleSession, async (c) => {
  const orgId = c.get("consoleSession").organizationId;
  try {
    const rows = await getPool().query<{
      invite_id: string;
      email: string;
      expires_at: Date;
      revoked_at: Date | null;
      created_at: Date;
      workflow_ids: unknown;
      period_start: Date | null;
      period_end: Date | null;
    }>(
      `SELECT invite_id, email, expires_at, revoked_at, created_at,
              workflow_ids, period_start, period_end
       FROM auditor_invite
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId],
    );
    return c.json({
      invites: rows.rows.map((r) => ({
        invite_id: r.invite_id,
        email: r.email,
        expires_at: r.expires_at.toISOString(),
        revoked_at: r.revoked_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
        workflow_ids: Array.isArray(r.workflow_ids) ? r.workflow_ids : [],
        period_start: r.period_start?.toISOString() ?? null,
        period_end: r.period_end?.toISOString() ?? null,
        active: !r.revoked_at && r.expires_at > new Date(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("auditor_invite") || message.includes("does not exist")) {
      return c.json(
        { error: "Auditor invites require migration 009. Run: pnpm db:migrate", invites: [] },
        503,
      );
    }
    throw error;
  }
});

auditorRoutes.post("/auditor/invites", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin" && session.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: {
    email?: string;
    days?: number;
    workflow_ids?: string[];
    period_start?: string;
    period_end?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "email required" }, 422);

  const token = randomBytes(24).toString("hex");
  const inviteId = `aud_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const days = Math.min(90, Math.max(1, body.days ?? 14));
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  await getPool().query(
    `INSERT INTO auditor_invite (
       invite_id, organization_id, email, token_hash, workflow_ids,
       period_start, period_end, expires_at, created_by
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`,
    [
      inviteId,
      session.organizationId,
      email,
      hashToken(token),
      JSON.stringify(body.workflow_ids ?? []),
      body.period_start ? new Date(body.period_start) : null,
      body.period_end ? new Date(body.period_end) : null,
      expiresAt,
      session.userId,
    ],
  );

  await auditFromConsoleSession(getPool(), session, {
    action: "auditor.invite_created",
    resourceType: "auditor_invite",
    resourceId: inviteId,
    metadata: { email },
  });

  const consoleOrigin =
    process.env.CONSOLE_PUBLIC_URL?.trim() ||
    process.env.CONSOLE_ORIGIN?.trim() ||
    "http://localhost:3000";

  return c.json(
    {
      invite: {
        invite_id: inviteId,
        email,
        expires_at: expiresAt.toISOString(),
        portal_url: `${consoleOrigin.replace(/\/$/, "")}/auditor/${token}`,
        /** Shown once; store offline. */
        token,
      },
    },
    201,
  );
});
