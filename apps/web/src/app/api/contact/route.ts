import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";

const CONTACT_REASONS = [
  "design_partner",
  "press",
  "careers",
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
  const salt =
    process.env.CONTACT_IP_SALT?.trim() ||
    "salanor-dev-contact-ip-salt-do-not-use-in-prod";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateHits.get(ip);
  if (!entry || now > entry.resetAt) {
    return false;
  }
  return entry.count >= RATE_MAX;
}

function recordSuccessfulSubmission(ip: string): void {
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

function parseSourcePath(req: NextRequest, body: Record<string, unknown>): string {
  const raw = body.source_path ?? body.sourcePath;
  if (typeof raw === "string" && raw.trim()) {
    const t = raw.trim();
    if (t.length <= 512) return t;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      const path = `${u.pathname}${u.search}`;
      return path.slice(0, 512);
    } catch {
      return "/";
    }
  }
  return "/";
}

async function notifySlack(payload: {
  name: string;
  email: string;
  reason: string;
  preview: string;
  id: string;
}): Promise<void> {
  const url = process.env.SLACK_CONTACT_WEBHOOK_URL?.trim();
  if (!url) return;

  const text = [
    "*New contact message*",
    `• Reason: ${payload.reason}`,
    `• From: ${payload.name} <${payload.email}>`,
    `• Id: ${payload.id}`,
    `• Preview: ${payload.preview}`,
  ].join("\n");

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${errText}`);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const website = body.website;
  if (
    typeof website === "string" &&
    website.trim().length > 0
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const ip = getClientIp(req);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw.toLowerCase();
  const organization =
    typeof body.organization === "string" ? body.organization.trim() : undefined;
  const senderRole =
    typeof body.role === "string" ? body.role.trim() : undefined;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const reason = body.reason;

  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: "Name is required (max 120 characters)." },
      { status: 400 },
    );
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }
  if (organization && organization.length > 200) {
    return NextResponse.json(
      { error: "Organization must be at most 200 characters." },
      { status: 400 },
    );
  }
  if (senderRole && senderRole.length > 120) {
    return NextResponse.json(
      { error: "Role must be at most 120 characters." },
      { status: 400 },
    );
  }
  if (!isContactReason(reason)) {
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });
  }
  if (!message || message.length < 5 || message.length > 12000) {
    return NextResponse.json(
      { error: "Message must be between 5 and 12,000 characters." },
      { status: 400 },
    );
  }

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const sourcePath = parseSourcePath(req, body);
  const ipHash = hashIp(ip);

  let id: string;
  try {
    const row = await prisma.contactMessage.create({
      data: {
        name,
        email,
        organization: organization || null,
        role: senderRole || null,
        reason,
        message,
        sourcePath,
        ipHash,
        status: "new",
      },
      select: { id: true },
    });
    id = row.id;

    void notifySlack({
      name,
      email,
      reason,
      preview: message.replace(/\s+/g, " ").slice(0, 200),
      id,
    }).catch((err) => {
      console.error("[contact] slack notification failed", err);
    });

    recordSuccessfulSubmission(ip);
  } catch (err) {
    console.error("[contact] database error", err);
    void captureException(err);
    return NextResponse.json(
      { error: "Could not save your message. Please try again later." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id }, { status: 201 });
}
