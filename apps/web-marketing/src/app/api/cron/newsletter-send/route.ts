import { NextRequest, NextResponse } from "next/server";

import { processScheduledNewsletterCampaigns } from "@/lib/newsletter/campaign-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

/** Vercel Cron (or any scheduler) — dispatches campaigns whose scheduled_at has passed. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processScheduledNewsletterCampaigns();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] newsletter-send failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 502 },
    );
  }
}
