import { NextRequest, NextResponse } from "next/server";

import { sendNewsletterCampaignTest } from "@/lib/newsletter/campaign-send";
import { verifyNewsletterOpsSecret } from "@/lib/newsletter/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!verifyNewsletterOpsSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    await sendNewsletterCampaignTest({ campaignId: id, toEmail: email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[newsletter] campaign test failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test send failed" },
      { status: 502 },
    );
  }
}
