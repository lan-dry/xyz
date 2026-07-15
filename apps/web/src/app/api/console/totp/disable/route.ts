import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleAuth } from "@/lib/console/api-route";
import { clearTotpAttemptBucket, consumeTotpAttempt } from "@/lib/totp/rate-limit";
import { verifyEnrollmentCode } from "@/lib/totp/enrollment";

export async function POST(req: NextRequest) {
  return withConsoleAuth(async (ctx) => {
    let body: { code?: string };
    try {
      body = (await req.json()) as { code?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, totpSecretEnc: true, totpEnabledAt: true },
    });
    if (!user?.totpSecretEnc || !user.totpEnabledAt) {
      return NextResponse.json({ error: "TOTP is not enabled" }, { status: 409 });
    }

    const bucketKey = `console-disable:${ctx.userId}`;
    const limit = consumeTotpAttempt(bucketKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many TOTP attempts. Please wait before retrying." },
        { status: 429, headers: { "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString() } },
      );
    }

    const valid = verifyEnrollmentCode(user.totpSecretEnc, code);
    if (!valid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    clearTotpAttemptBucket(bucketKey);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEnc: null,
        totpEnabledAt: null,
      },
    });
    await appendConsoleAudit({
      organizationId: ctx.activeOrgId,
      actorIdentityId: ctx.identityLinkId,
      action: "auth.totp_disabled",
      metadata: { surface: "console" },
    });

    return NextResponse.json({ ok: true });
  });
}
