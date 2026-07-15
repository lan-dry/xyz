import { NextRequest, NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { assertNoRawSecretInStorage, generateApiKeyMaterial, hashApiKeySecret } from "@/lib/console/api-keys";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "developer", async (scoped) => {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: scoped.activeOrgId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
    return NextResponse.json({ keys });
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "developer", async (scoped) => {
    let body: { name?: string };
    try {
      body = (await req.json()) as { name?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = body.name?.trim() || "Default key";
    const { prefix, fullKey } = generateApiKeyMaterial();
    const secretHash = await hashApiKeySecret(fullKey);
    assertNoRawSecretInStorage(fullKey, { prefix, secretHash });

    const row = await prisma.apiKey.create({
      data: {
        organizationId: scoped.activeOrgId,
        name,
        prefix,
        secretHash,
        createdById: scoped.identityLinkId,
      },
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "api_key_created",
      targetType: "api_key",
      targetId: row.id,
      metadata: { name, prefix },
    });

    return NextResponse.json(
      {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        secret: fullKey,
        createdAt: row.createdAt,
      },
      { status: 201 },
    );
  });
}
