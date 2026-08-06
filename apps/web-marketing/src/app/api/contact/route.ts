import { NextRequest, NextResponse } from "next/server";

/**
 * Enterprise path: marketing never talks to Postgres.
 * Proxies to salanor-id `POST /v1/id/public/contact` (Railway).
 * Vercel marketing only needs SALANOR_ID_URL.
 */
const idBase = (process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  let upstream: Response;
  try {
    upstream = await fetch(`${idBase}/v1/id/public/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(realIp ? { "x-real-ip": realIp } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[contact] id upstream unreachable", err);
    return NextResponse.json(
      { error: "Could not save your message. Email partners@salanor.com." },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
