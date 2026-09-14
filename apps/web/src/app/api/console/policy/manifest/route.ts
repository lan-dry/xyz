import { NextResponse } from "next/server";

import { createPolicyManifest, resolvePolicySigningKey } from "@/lib/aegis/policy-manifest";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    const signingKey = resolvePolicySigningKey();
    if (!signingKey) {
      return NextResponse.json(
        { error: "Policy signing key is not configured (set POLICY_SIGNING_KEY or AUTH_SECRET)." },
        { status: 503 },
      );
    }

    const activePolicy = await prisma.aegisPolicy.findFirst({
      where: {
        organizationId: scoped.activeOrgId,
        enabled: true,
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        version: true,
        rules: true,
        createdAt: true,
      },
    });
    if (!activePolicy) {
      return NextResponse.json({ error: "No active policy found." }, { status: 404 });
    }

    const manifest = createPolicyManifest({
      organizationId: scoped.activeOrgId,
      policyId: activePolicy.id,
      name: activePolicy.name,
      version: activePolicy.version,
      rules: activePolicy.rules as Record<string, unknown>,
      createdAt: activePolicy.createdAt,
      signingKey,
    });

    return NextResponse.json({ manifest });
  });
}
