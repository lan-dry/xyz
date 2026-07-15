import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  issueTotpChallengeCookie,
  TOTP_CHALLENGE_COOKIE_MAX_AGE_SECONDS,
  TOTP_CHALLENGE_COOKIE_NAME,
} from "@/lib/totp/challenge-cookie";
import { clearTotpAttemptBucket, consumeTotpAttempt } from "@/lib/totp/rate-limit";
import { verifyEnrollmentCode } from "@/lib/totp/enrollment";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { code?: string; callbackUrl?: string };
  try {
    body = (await req.json()) as { code?: string; callbackUrl?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, totpSecretEnc: true, totpEnabledAt: true },
  });
  if (!user?.totpSecretEnc || !user.totpEnabledAt) {
    return NextResponse.json({ error: "TOTP is not enabled for this account" }, { status: 409 });
  }

  const bucketKey = `signin:${userId}`;
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

  const response = NextResponse.json({
    ok: true,
    callbackUrl: body.callbackUrl ?? "/app/console/aegis",
  });
  response.cookies.set(TOTP_CHALLENGE_COOKIE_NAME, await issueTotpChallengeCookie(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOTP_CHALLENGE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
