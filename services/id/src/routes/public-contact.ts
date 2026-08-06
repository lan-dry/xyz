import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";

import { getClientIp } from "@salanor/platform-auth";

import { getPool } from "../db/pool.js";
import { sendContactLeadEmail } from "../email/send-contact-notify.js";
import { createContactLead } from "../lib/contact-leads.js";

const CONTACT_REASONS = [
  "design_partner",
  "investor",
  "enterprise",
  "press",
  "security",
] as const;

type ContactReason = (typeof CONTACT_REASONS)[number];

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;
const rateHits = new Map<string, { count: number; resetAt: number }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashIp(ip: string): string {
  const salt = process.env.CONTACT_IP_SALT?.trim() ?? "salanor-contact-ip-salt";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateHits.get(ip);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= RATE_MAX;
}

function recordHit(ip: string): void {
  const now = Date.now();
  const entry = rateHits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function isContactReason(v: unknown): v is ContactReason {
  return typeof v === "string" && (CONTACT_REASONS as readonly string[]).includes(v);
}

/** Public marketing contact → Postgres + Ops leads inbox. */
export const publicContactRoutes = new Hono();

publicContactRoutes.post("/contact", async (c) => {
  if (!process.env.DATABASE_URL) {
    return c.json({ error: "Contact service is not configured" }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const trap =
    (typeof body._gotcha === "string" ? body._gotcha : "") ||
    (typeof body.website === "string" ? body.website : "");
  if (trap.trim().length > 0) {
    return c.json({ error: "Bad request" }, 400);
  }

  const ip = getClientIp(c.req.raw.headers);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const organization = typeof body.organization === "string" ? body.organization.trim() : "";
  const senderRole = typeof body.role === "string" ? body.role.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const reason = body.reason;
  const sourcePath =
    typeof body.sourcePath === "string" && body.sourcePath.length <= 512
      ? body.sourcePath.trim()
      : "/contact";

  if (!name || name.length > 120) {
    return c.json({ error: "Name is required (max 120 characters)." }, 400);
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return c.json({ error: "A valid email is required." }, 400);
  }
  if (!isContactReason(reason)) {
    return c.json({ error: "Invalid topic." }, 400);
  }
  if (!message || message.length < 5 || message.length > 12000) {
    return c.json({ error: "Message must be between 5 and 12,000 characters." }, 400);
  }

  if (isRateLimited(ip)) {
    return c.json({ error: "Too many requests. Try again later." }, 429);
  }

  const id = randomUUID();
  try {
    await createContactLead(getPool(), {
      id,
      name,
      email,
      organization: organization || null,
      role: senderRole || null,
      reason,
      message,
      sourcePath,
      ipHash: hashIp(ip),
    });
    recordHit(ip);
  } catch (err) {
    console.error("[id] contact persist", err);
    return c.json(
      { error: "Could not save your message. Email partners@salanor.com." },
      500,
    );
  }

  const notify = await sendContactLeadEmail({
    id,
    name,
    email,
    organization: organization || null,
    role: senderRole || null,
    reason,
    message,
    sourcePath,
  });
  if (!notify.sent) {
    console.info(`[id] contact ${id} saved; email skipped (${notify.skipped ?? "unknown"})`);
  }

  console.info(`[id] contact ${id} ${reason} ${email}`);
  return c.json({ id, emailed: notify.sent }, 201);
});
