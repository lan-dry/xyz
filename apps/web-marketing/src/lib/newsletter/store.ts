import { randomUUID } from "node:crypto";

import { getNewsletterPool } from "./pool";
import { newNewsletterToken } from "./tokens";

export type NewsletterRow = {
  id: string;
  email: string;
  confirmed_at: Date | null;
  unsubscribed_at: Date | null;
  unsubscribe_token: string;
  confirm_token: string | null;
  confirm_token_expires_at: Date | null;
  updated_at: Date;
};

const RESEND_COOLDOWN_MS =
  (Number(process.env.NEWSLETTER_CONFIRM_RESEND_MINUTES) || 15) * 60 * 1000;

const CONFIRM_TTL_MS =
  (Number(process.env.NEWSLETTER_CONFIRM_TTL_HOURS) || 72) * 60 * 60 * 1000;

export function isActiveSubscriber(row: Pick<NewsletterRow, "confirmed_at" | "unsubscribed_at">): boolean {
  return row.confirmed_at != null && row.unsubscribed_at == null;
}

export async function subscribeNewsletter(input: {
  email: string;
  source: string;
  signupIpHash: string | null;
}): Promise<
  | { status: "pending_confirm"; id: string; confirmToken: string; email: string; sendEmail: boolean }
  | { status: "already_active"; email: string }
  | { status: "reconfirm_sent"; id: string; confirmToken: string; email: string; sendEmail: boolean }
> {
  const pool = getNewsletterPool();
  if (!pool) throw new Error("DATABASE_URL not configured");

  const email = input.email.trim().toLowerCase();
  const confirmToken = newNewsletterToken();
  const unsubscribeToken = newNewsletterToken();
  const confirmExpires = new Date(Date.now() + CONFIRM_TTL_MS);

  const client = await pool.connect();
  try {
    const existing = await client.query<NewsletterRow>(
      `SELECT id, email, confirmed_at, unsubscribed_at, unsubscribe_token,
              confirm_token, confirm_token_expires_at, updated_at
       FROM newsletter_subscribers
       WHERE lower(trim(email)) = $1
       LIMIT 1`,
      [email],
    );
    const row = existing.rows[0];

    if (row && isActiveSubscriber(row)) {
      return { status: "already_active", email };
    }

    if (row) {
      const tokenValid =
        row.confirm_token &&
        row.confirm_token_expires_at &&
        row.confirm_token_expires_at.getTime() > Date.now();
      const recentlySent = Date.now() - row.updated_at.getTime() < RESEND_COOLDOWN_MS;

      if (tokenValid && recentlySent && row.confirm_token) {
        return {
          status: "reconfirm_sent",
          id: row.id,
          confirmToken: row.confirm_token,
          email,
          sendEmail: false,
        };
      }

      await client.query(
        `UPDATE newsletter_subscribers SET
           email = $2,
           updated_at = now(),
           confirmed_at = NULL,
           confirm_token = $3,
           confirm_token_expires_at = $4,
           unsubscribed_at = NULL,
           source = $5,
           signup_ip_hash = COALESCE($6, signup_ip_hash)
         WHERE id = $1`,
        [row.id, email, confirmToken, confirmExpires, input.source, input.signupIpHash],
      );
      return { status: "reconfirm_sent", id: row.id, confirmToken, email, sendEmail: true };
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO newsletter_subscribers (
         id, email, confirm_token, confirm_token_expires_at,
         unsubscribe_token, source, signup_ip_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, email, confirmToken, confirmExpires, unsubscribeToken, input.source, input.signupIpHash],
    );
    return { status: "pending_confirm", id, confirmToken, email, sendEmail: true };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

export async function confirmNewsletter(confirmToken: string): Promise<
  | { ok: true; email: string; alreadyConfirmed: boolean; unsubscribeToken: string }
  | { ok: false; reason: "invalid" | "expired" }
> {
  const pool = getNewsletterPool();
  if (!pool) throw new Error("DATABASE_URL not configured");

  const client = await pool.connect();
  try {
    const res = await client.query<{
      id: string;
      email: string;
      confirmed_at: Date | null;
      confirm_token_expires_at: Date | null;
    }>(
      `SELECT id, email, confirmed_at, confirm_token_expires_at
       FROM newsletter_subscribers
       WHERE confirm_token = $1
       LIMIT 1`,
      [confirmToken.trim()],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: "invalid" };

    if (row.confirmed_at) {
      const tok = await client.query<{ unsubscribe_token: string }>(
        `SELECT unsubscribe_token FROM newsletter_subscribers WHERE id = $1`,
        [row.id],
      );
      await client.query(
        `UPDATE newsletter_subscribers SET confirm_token = NULL, confirm_token_expires_at = NULL, updated_at = now()
         WHERE id = $1`,
        [row.id],
      );
      const unsubscribeToken = tok.rows[0]?.unsubscribe_token;
      if (!unsubscribeToken) return { ok: false, reason: "invalid" };
      return { ok: true, email: row.email, alreadyConfirmed: true, unsubscribeToken };
    }

    if (row.confirm_token_expires_at && row.confirm_token_expires_at.getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }

    const tok = await client.query<{ unsubscribe_token: string }>(
      `UPDATE newsletter_subscribers SET
         confirmed_at = now(),
         confirm_token = NULL,
         confirm_token_expires_at = NULL,
         unsubscribed_at = NULL,
         updated_at = now()
       WHERE id = $1
       RETURNING unsubscribe_token`,
      [row.id],
    );
    const unsubscribeToken = tok.rows[0]?.unsubscribe_token;
    if (!unsubscribeToken) return { ok: false, reason: "invalid" };
    return { ok: true, email: row.email, alreadyConfirmed: false, unsubscribeToken };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

export async function unsubscribeNewsletter(unsubscribeToken: string): Promise<
  | { ok: true; email: string; alreadyUnsubscribed: boolean }
  | { ok: false; reason: "invalid" }
> {
  const pool = getNewsletterPool();
  if (!pool) throw new Error("DATABASE_URL not configured");

  const token = unsubscribeToken.trim();
  const client = await pool.connect();
  try {
    const res = await client.query<{ id: string; email: string; unsubscribed_at: Date | null }>(
      `SELECT id, email, unsubscribed_at FROM newsletter_subscribers WHERE unsubscribe_token = $1 LIMIT 1`,
      [token],
    );
    const row = res.rows[0];
    if (!row) return { ok: false, reason: "invalid" };

    if (row.unsubscribed_at) {
      return { ok: true, email: row.email, alreadyUnsubscribed: true };
    }

    await client.query(
      `UPDATE newsletter_subscribers SET unsubscribed_at = now(), updated_at = now(), confirm_token = NULL WHERE id = $1`,
      [row.id],
    );
    return { ok: true, email: row.email, alreadyUnsubscribed: false };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}
