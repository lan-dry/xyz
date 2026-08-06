import { NextRequest, NextResponse } from "next/server";

/**
 * Enterprise path: marketing never talks to Postgres.
 * Proxies to salanor-id `POST /v1/id/public/contact` (Railway).
 * Vercel marketing MUST set SALANOR_ID_URL=https://id.salanor.com
 */
function resolveIdBase(): string | null {
  const raw = process.env.SALANOR_ID_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const idBase = resolveIdBase();
  if (!idBase) {
    console.error("[contact] SALANOR_ID_URL is not set on this deployment");
    return NextResponse.json(
      {
        error:
          "Contact service is not configured (SALANOR_ID_URL). Email partners@salanor.com.",
      },
      { status: 503 },
    );
  }

  if (
    process.env.VERCEL === "1" &&
    (idBase.includes("127.0.0.1") || idBase.includes("localhost"))
  ) {
    console.error("[contact] SALANOR_ID_URL points at localhost on Vercel:", idBase);
    return NextResponse.json(
      {
        error: "Contact service misconfigured. Email partners@salanor.com.",
      },
      { status: 503 },
    );
  }

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
    console.error("[contact] id upstream unreachable", idBase, err);
    return NextResponse.json(
      { error: "Could not save your message. Email partners@salanor.com." },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error("[contact] id upstream status", upstream.status, payload);
  }
  return NextResponse.json(payload, { status: upstream.status });
}
