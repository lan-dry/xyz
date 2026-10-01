import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { sendNewsletterConfirmEmail } from "@/lib/newsletter/email";
import { subscribeNewsletter } from "@/lib/newsletter/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 10;
const rateHits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.NEWSLETTER_IP_SALT?.trim() || process.env.CONTACT_IP_SALT?.trim() || "salanor-newsletter-ip";
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

export async function POST(req: NextRequest) {
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trap =
    (typeof raw._gotcha === "string" ? raw._gotcha : "") ||
    (typeof raw.website === "string" ? raw.website : "");
  if (trap.trim().length > 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const source =
    typeof raw.source === "string" && raw.source.length <= 64 ? raw.source.trim() : "website_footer";

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const result = await subscribeNewsletter({
      email,
      source,
      signupIpHash: hashIp(ip),
    });
    recordHit(ip);

    if (result.status === "already_active") {
      return NextResponse.json({
        ok: true,
        message: "You are already subscribed.",
      });
    }

    if (result.sendEmail) {
      await sendNewsletterConfirmEmail({
        email: result.email,
        confirmToken: result.confirmToken,
      });
      return NextResponse.json({
        ok: true,
        message: "Check your inbox to confirm your subscription.",
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Confirmation email already sent. Check your inbox (or wait a few minutes to request again).",
    });
  } catch (err) {
    console.error("[newsletter] subscribe failed", err);
    return NextResponse.json(
      { error: "Could not subscribe right now. Try again later." },
      { status: 502 },
    );
  }
}
