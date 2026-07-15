import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleAuth } from "@/lib/console/api-route";
import { startEnrollmentForUser } from "@/lib/totp/enrollment";

export async function POST() {
  return withConsoleAuth(async (ctx) => {
    let setup: Awaited<ReturnType<typeof startEnrollmentForUser>>;
    try {
      setup = await startEnrollmentForUser(prisma, ctx.userId);
    } catch (error) {
      if (error instanceof Error && error.message === "AlreadyEnabled") {
        return NextResponse.json({ error: "TOTP already enabled" }, { status: 409 });
      }
      if (error instanceof Error && error.message === "UserNotFound") {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      throw error;
    }

    await appendConsoleAudit({
      organizationId: ctx.activeOrgId,
      actorIdentityId: ctx.identityLinkId,
      action: "auth.totp_setup_started",
      metadata: { surface: "console" },
    });

    return NextResponse.json({
      manualKey: setup.manualKey,
      otpauthUrl: setup.otpauthUrl,
      qrDataUrl: setup.qrDataUrl,
    });
  });
}
