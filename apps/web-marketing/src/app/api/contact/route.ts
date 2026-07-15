import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { insertContactMessage } from "@/lib/contact-store";
import { sendContactNotification } from "@/lib/send-contact-email";

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

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.CONTACT_IP_SALT?.trim() ?? "salanor-dev-contact-ip-salt";
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

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trap =
    (typeof body._gotcha === "string" ? body._gotcha : "") ||
    (typeof body.website === "string" ? body.website : "");
  if (trap.trim().length > 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const ip = getClientIp(req);
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
    return NextResponse.json({ error: "Name is required (max 120 characters)." }, { status: 400 });
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!isContactReason(reason)) {
    return NextResponse.json({ error: "Invalid topic." }, { status: 400 });
  }
  if (!message || message.length < 5 || message.length > 12000) {
    return NextResponse.json(
      { error: "Message must be between 5 and 12,000 characters." },
      { status: 400 },
    );
  }

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const id = randomUUID();

  try {
    await insertContactMessage({
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
    console.error("[contact]", err);
    return NextResponse.json(
      { error: "Could not save your message. Email partners@salanor.com." },
      { status: 500 },
    );
  }

  try {
    await sendContactNotification({
      id,
      name,
      email,
      organization: organization || null,
      role: senderRole || null,
      reason,
      message,
      sourcePath,
    });
  } catch (err) {
    console.error("[contact] email notify failed", err);
  }

  console.info(`[contact] ${id} ${reason} ${email}`);
  return NextResponse.json({ id }, { status: 201 });
}
