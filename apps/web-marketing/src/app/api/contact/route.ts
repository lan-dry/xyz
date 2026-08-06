import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import pg from "pg";

import { sendContactNotification } from "@/lib/send-contact-email";

/**
 * Contact form handler.
 * 1) Prefer salanor-id (enterprise path).
 * 2) Fallback: write contact_messages via DATABASE_URL on this deployment + email notify.
 *    (Marketing already has DATABASE_URL in Vercel — unblocks form when ID route is stale.)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTACT_REASONS = [
  "design_partner",
  "investor",
  "enterprise",
  "press",
  "security",
] as const;

type ContactReason = (typeof CONTACT_REASONS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;
const rateHits = new Map<string, { count: number; resetAt: number }>();

function resolveIdBase(): string | null {
  const raw = process.env.SALANOR_ID_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.CONTACT_IP_SALT?.trim() || "salanor-contact-ip-salt";
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

type ParsedBody = {
  name: string;
  email: string;
  organization: string;
  role: string;
  reason: ContactReason;
  message: string;
  sourcePath: string;
};

function parseBody(raw: Record<string, unknown>): { ok: true; data: ParsedBody } | { ok: false; error: string; status: number } {
  const trap =
    (typeof raw._gotcha === "string" ? raw._gotcha : "") ||
    (typeof raw.website === "string" ? raw.website : "");
  if (trap.trim().length > 0) {
    return { ok: false, error: "Bad request", status: 400 };
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const organization = typeof raw.organization === "string" ? raw.organization.trim() : "";
  const role = typeof raw.role === "string" ? raw.role.trim() : "";
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const reason = raw.reason;
  const sourcePath =
    typeof raw.sourcePath === "string" && raw.sourcePath.length <= 512
      ? raw.sourcePath.trim()
      : "/contact";

  if (!name || name.length > 120) {
    return { ok: false, error: "Name is required (max 120 characters).", status: 400 };
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "A valid email is required.", status: 400 };
  }
  if (!isContactReason(reason)) {
    return { ok: false, error: "Invalid topic.", status: 400 };
  }
  if (!message || message.length < 5 || message.length > 12000) {
    return { ok: false, error: "Message must be between 5 and 12,000 characters.", status: 400 };
  }

  return {
    ok: true,
    data: { name, email, organization, role, reason, message, sourcePath },
  };
}

async function tryIdProxy(
  idBase: string,
  body: unknown,
  req: NextRequest,
): Promise<NextResponse | null> {
  if (
    process.env.VERCEL === "1" &&
    (idBase.includes("127.0.0.1") || idBase.includes("localhost"))
  ) {
    return null;
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (forwarded) headers["x-forwarded-for"] = forwarded;
  if (realIp) headers["x-real-ip"] = realIp;

  for (const path of ["/v1/id/public/contact", "/v1/id/leads/contact"] as const) {
    try {
      const upstream = await fetch(`${idBase}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (upstream.status === 404) continue;
      const payload = await upstream.json().catch(() => ({}));
      return NextResponse.json(payload, { status: upstream.status });
    } catch (err) {
      console.error("[contact] id proxy failed", path, err);
    }
  }
  return null;
}

async function persistLocally(
  data: ParsedBody,
  ip: string,
): Promise<{ id: string; emailed: boolean }> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not configured for contact fallback");
  }

  const id = randomUUID();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query(
      `INSERT INTO contact_messages (
         id, name, email, organization, role, reason, message, source_path, ip_hash, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')`,
      [
        id,
        data.name,
        data.email,
        data.organization || null,
        data.role || null,
        data.reason,
        data.message,
        data.sourcePath,
        hashIp(ip),
      ],
    );
  } finally {
    await pool.end().catch(() => undefined);
  }

  let emailed = false;
  try {
    const notify = await sendContactNotification({
      id,
      name: data.name,
      email: data.email,
      organization: data.organization || null,
      role: data.role || null,
      reason: data.reason,
      message: data.message,
      sourcePath: data.sourcePath,
    });
    emailed = notify.sent;
  } catch (err) {
    console.error("[contact] notify failed after persist", err);
  }

  return { id, emailed };
}

export async function POST(req: NextRequest) {
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const idBase = resolveIdBase();
  if (idBase) {
    const proxied = await tryIdProxy(idBase, raw, req);
    if (proxied) {
      if (proxied.status >= 200 && proxied.status < 300) recordHit(ip);
      return proxied;
    }
  }

  try {
    const result = await persistLocally(parsed.data, ip);
    recordHit(ip);
    console.info(`[contact] fallback persist ${result.id}`);
    return NextResponse.json({ id: result.id, emailed: result.emailed }, { status: 201 });
  } catch (err) {
    console.error("[contact] fallback persist failed", err);
    return NextResponse.json(
      { error: "Could not save your message. Email partners@salanor.com." },
      { status: 502 },
    );
  }
}
