import { NextRequest, NextResponse } from "next/server";

import { sendNewsletterCampaign } from "@/lib/newsletter/campaign-send";
import { verifyNewsletterOpsSecret } from "@/lib/newsletter/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!verifyNewsletterOpsSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const result = await sendNewsletterCampaign(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[newsletter] campaign send failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 502 },
    );
  }
}
