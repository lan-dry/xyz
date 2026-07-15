import { NextRequest, NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
    }

    const input = body as { policyId?: unknown; enabled?: unknown };
    const policyId = typeof input.policyId === "string" ? input.policyId.trim() : "";
    const enabled = input.enabled !== false;
    if (!policyId) {
      return NextResponse.json({ error: "policyId is required" }, { status: 400 });
    }

    const target = await prisma.aegisPolicy.findFirst({
      where: {
        id: policyId,
        organizationId: scoped.activeOrgId,
      },
      select: { id: true, version: true, enabled: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    if (enabled) {
      await prisma.$transaction(async (tx) => {
        await tx.aegisPolicy.updateMany({
          where: { organizationId: scoped.activeOrgId, enabled: true },
          data: { enabled: false },
        });
        await tx.aegisPolicy.update({
          where: { id: target.id },
          data: { enabled: true },
        });
      });
    } else {
      await prisma.aegisPolicy.update({
        where: { id: target.id },
        data: { enabled: false },
      });
    }

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "policy_updated",
      targetType: "aegis_policy",
      targetId: target.id,
      metadata: {
        operation: enabled ? "enable" : "disable",
        version: target.version,
      },
    });

    return NextResponse.json({ ok: true });
  });
}
