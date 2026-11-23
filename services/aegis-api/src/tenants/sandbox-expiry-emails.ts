/**
 * Sandbox expiry emails (7d / 2d / expired) with optional file capture for tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type pg from "pg";
import {
  applySandboxReadOnly,
  archiveSandbox,
  listSandboxLifecycleDue,
  type SandboxLifecycleAction,
} from "./sandbox-lifecycle.js";

export type SandboxExpiryEmailRecord = {
  organization_id: string;
  slug: string;
  action: SandboxLifecycleAction;
  to: string;
  subject: string;
  text: string;
  delivered: "captured" | "skipped";
  at: string;
};

function captureDir(): string | null {
  const raw = process.env.SANDBOX_EXPIRY_EMAIL_CAPTURE_DIR?.trim();
  return raw || null;
}

function subjectFor(action: SandboxLifecycleAction, slug: string): string {
  switch (action) {
    case "email_7d":
      return `Your Salanor sandbox (${slug}) expires in 7 days`;
    case "email_2d":
      return `Your Salanor sandbox (${slug}) expires in 2 days`;
    case "email_expired":
      return `Your Salanor sandbox (${slug}) has expired (read-only)`;
    default:
      return `Salanor sandbox update (${slug})`;
  }
}

function bodyFor(action: SandboxLifecycleAction, slug: string, expiresAt: Date): string {
  const when = expiresAt.toISOString();
  if (action === "email_7d") {
    return `Your sandbox "${slug}" expires on ${when}. Extend it from Ops or Reset my sandbox in the console. Synthetic data only.`;
  }
  if (action === "email_2d") {
    return `Your sandbox "${slug}" expires on ${when} (about 2 days). After expiry it becomes read-only for 7 days, then archives.`;
  }
  if (action === "email_expired") {
    return `Your sandbox "${slug}" expired on ${when}. It is read-only for 7 days, then will be archived. Contact Ops to extend if you still need it.`;
  }
  return `Sandbox "${slug}" lifecycle action: ${action}`;
}

async function adminEmails(
  db: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<string[]> {
  const r = await db.query<{ email: string }>(
    `SELECT a.email
       FROM membership m
       JOIN account a ON a.account_id = m.account_id
      WHERE m.organization_id = $1
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
        AND a.active = true`,
    [organizationId],
  );
  return r.rows.map((row) => row.email);
}

function writeCapture(record: SandboxExpiryEmailRecord): void {
  const dir = captureDir();
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const name = `sandbox-expiry-${record.action}-${record.organization_id.slice(0, 8)}.json`;
  writeFileSync(resolve(dir, name), JSON.stringify(record, null, 2), "utf8");
}

export type SandboxLifecycleTickSummary = {
  due: number;
  emails: SandboxExpiryEmailRecord[];
  read_only: string[];
  archived: string[];
};

/**
 * Apply due sandbox lifecycle actions. Emails are captured to disk when
 * SANDBOX_EXPIRY_EMAIL_CAPTURE_DIR is set; otherwise logged and marked skipped
 * (Resend/SMTP wiring is shared with platform email settings — live send is founder-run).
 */
export async function runSandboxLifecycleTick(
  db: pg.Pool | pg.PoolClient,
  now = new Date(),
): Promise<SandboxLifecycleTickSummary> {
  const due = await listSandboxLifecycleDue(db, now);
  const emails: SandboxExpiryEmailRecord[] = [];
  const read_only: string[] = [];
  const archived: string[] = [];
  const emailed = new Set<string>();

  for (const item of due) {
    if (item.action === "set_read_only") {
      await applySandboxReadOnly(db, item.organization_id, now);
      read_only.push(item.organization_id);
      await db.query(
        `INSERT INTO platform_sandbox_audit (organization_id, action, actor, detail)
         VALUES ($1, 'set_read_only', 'sandbox-lifecycle', '{}'::jsonb)`,
        [item.organization_id],
      );
      continue;
    }
    if (item.action === "archive") {
      await archiveSandbox(db, item.organization_id, now);
      archived.push(item.organization_id);
      await db.query(
        `INSERT INTO platform_sandbox_audit (organization_id, action, actor, detail)
         VALUES ($1, 'archive', 'sandbox-lifecycle', '{}'::jsonb)`,
        [item.organization_id],
      );
      continue;
    }

    const dedupe = `${item.organization_id}:${item.action}`;
    if (emailed.has(dedupe)) continue;
    emailed.add(dedupe);

    const recipients = await adminEmails(db, item.organization_id);
    const targets = recipients.length > 0 ? recipients : [`ops+${item.slug}@salanor.local`];
    for (const to of targets) {
      const record: SandboxExpiryEmailRecord = {
        organization_id: item.organization_id,
        slug: item.slug,
        action: item.action,
        to,
        subject: subjectFor(item.action, item.slug),
        text: bodyFor(item.action, item.slug, item.sandbox_expires_at),
        delivered: captureDir() ? "captured" : "skipped",
        at: now.toISOString(),
      };
      writeCapture(record);
      if (!captureDir()) {
        console.info(
          `[sandbox-lifecycle] email ${record.action} to ${to}: ${record.subject}`,
        );
      }
      emails.push(record);
      await db.query(
        `INSERT INTO platform_sandbox_audit (organization_id, action, actor, detail)
         VALUES ($1, $2, 'sandbox-lifecycle', $3::jsonb)`,
        [
          item.organization_id,
          item.action,
          JSON.stringify({ to, subject: record.subject, delivered: record.delivered }),
        ],
      );
    }
  }

  return { due: due.length, emails, read_only, archived };
}
