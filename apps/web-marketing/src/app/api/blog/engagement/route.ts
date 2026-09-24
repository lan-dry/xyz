import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import pg from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "time_on_page",
  "scroll_depth",
  "listen_start",
  "listen_pause",
  "listen_resume",
  "listen_complete",
  "listen_seconds",
  "share_click",
  "copy_link",
]);

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) pool = new pg.Pool({ connectionString: url, max: 4 });
  return pool;
}

function hashIp(ip: string): string {
  const salt = process.env.BLOG_ENGAGEMENT_SALT?.trim() || "salanor-blog-engagement";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) {
    return NextResponse.json({ ok: true, stored: false });
  }

  let body: {
    slug?: string;
    event?: string;
    sessionKey?: string;
    valueNum?: number | null;
    metadata?: Record<string, unknown>;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = body.slug?.trim().toLowerCase();
  const event = body.event?.trim();
  const sessionKey = body.sessionKey?.trim();

  if (!slug || !event || !sessionKey || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (slug.length > 120 || sessionKey.length > 80) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";

  const metadata = {
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    ip_hash: hashIp(ip),
  };

  try {
    await db.query(
      `INSERT INTO blog_engagement_events (slug, event_name, session_key, value_num, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        slug,
        event,
        sessionKey,
        typeof body.valueNum === "number" && Number.isFinite(body.valueNum) ? body.valueNum : null,
        JSON.stringify(metadata),
      ],
    );
    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missing =
      message.includes("blog_engagement_events") &&
      (message.includes("does not exist") || message.includes("42P01"));
    if (missing) {
      return NextResponse.json({
        ok: true,
        stored: false,
        hint: "Run pnpm db:migrate (001_baseline) and set DATABASE_URL on web-marketing.",
      });
    }
    console.error("[blog/engagement]", message);
    return NextResponse.json({ error: "Failed to store event" }, { status: 500 });
  }
}
