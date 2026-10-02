import { NextRequest, NextResponse } from "next/server";

import { unsubscribeNewsletter } from "@/lib/newsletter/store";
import { SITE_ORIGIN } from "@/lib/site-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function performUnsubscribe(token: string) {
  const result = await unsubscribeNewsletter(token);
  if (!result.ok) {
    return { ok: false as const, reason: "invalid" as const };
  }
  return { ok: true as const, email: result.email };
}

/** Browser link from email footer. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/unsubscribe?error=missing`);
  }

  try {
    const result = await performUnsubscribe(token);
    if (!result.ok) {
      return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/unsubscribe?error=invalid`);
    }
    return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/unsubscribe?ok=1`);
  } catch (err) {
    console.error("[newsletter] unsubscribe failed", err);
    return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/unsubscribe?error=server`);
  }
}

/**
 * RFC 8058 one-click (Gmail/Yahoo header "Unsubscribe").
 * Must respond 2xx — redirects break list-unsubscribe registration.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  try {
    const result = await performUnsubscribe(token);
    if (!result.ok) {
      return new NextResponse("Invalid token", { status: 404 });
    }
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("[newsletter] one-click unsubscribe failed", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
