import { NextRequest, NextResponse } from "next/server";

/**
 * Marketing contact → salanor-id (Railway).
 * Uses runtime SALANOR_ID_URL (not build-time rewrite only).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveIdBase(): string | null {
  const raw = process.env.SALANOR_ID_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

const CONTACT_PATHS = [
  "/v1/id/public/contact",
  "/v1/id/leads/contact",
] as const;

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (forwarded) headers["x-forwarded-for"] = forwarded;
  if (realIp) headers["x-real-ip"] = realIp;

  let lastStatus = 502;
  let lastPayload: unknown = {
    error: "Could not save your message. Email partners@salanor.com.",
  };

  for (const path of CONTACT_PATHS) {
    try {
      const upstream = await fetch(`${idBase}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const payload = await upstream.json().catch(() => ({}));
      if (upstream.status !== 404) {
        if (!upstream.ok) {
          console.error("[contact] id upstream", path, upstream.status, payload);
        }
        return NextResponse.json(payload, { status: upstream.status });
      }
      lastStatus = upstream.status;
      lastPayload = payload;
    } catch (err) {
      console.error("[contact] id upstream unreachable", idBase, path, err);
      lastStatus = 502;
      lastPayload = {
        error: "Could not save your message. Email partners@salanor.com.",
      };
    }
  }

  console.error("[contact] all id contact paths returned 404 — redeploy salanor-id");
  return NextResponse.json(lastPayload, { status: lastStatus === 404 ? 502 : lastStatus });
}
