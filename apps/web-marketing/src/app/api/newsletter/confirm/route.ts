import { NextRequest, NextResponse } from "next/server";

import { sendNewsletterWelcomeEmail } from "@/lib/newsletter/email";
import { confirmNewsletter } from "@/lib/newsletter/store";
import { SITE_ORIGIN } from "@/lib/site-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/confirm?error=missing`);
  }

  try {
    const result = await confirmNewsletter(token);
    if (!result.ok) {
      const q = result.reason === "expired" ? "expired" : "invalid";
      return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/confirm?error=${q}`);
    }
    if (!result.alreadyConfirmed) {
      await sendNewsletterWelcomeEmail({
        email: result.email,
        unsubscribeToken: result.unsubscribeToken,
      }).catch((err) => {
        console.error("[newsletter] welcome email failed", err);
      });
    }
    return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/confirm?ok=1`);
  } catch (err) {
    console.error("[newsletter] confirm failed", err);
    return NextResponse.redirect(`${SITE_ORIGIN}/newsletter/confirm?error=server`);
  }
}
