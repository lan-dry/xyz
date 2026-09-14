import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleAuth } from "@/lib/console/api-route";
import { ensureIdentityLink } from "@/lib/console/identity";
import { isValidOrganizationSlug, normalizeOrganizationSlug, validateOrganizationName } from "@/lib/console/orgs";
import { setActiveOrgCookie } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return withConsoleAuth(async (ctx) =>
    NextResponse.json({
      activeOrgId: ctx.activeOrgId,
      organizations: ctx.memberships.map((m) => ({
        id: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    }),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Console session required" }, { status: 401 });
  }

  let body: { name?: string; slug?: string };
  try {
    body = (await req.json()) as { name?: string; slug?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = validateOrganizationName(body.name ?? "");
  if (!name) {
    return NextResponse.json({ error: "Organization name must be at least 2 characters" }, { status: 400 });
  }

  const slugInput = body.slug?.trim() ? body.slug : name;
  const slug = normalizeOrganizationSlug(slugInput);
  if (!isValidOrganizationSlug(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens" },
      { status: 400 },
    );
  }

  const identity = await ensureIdentityLink(session.user.id, session.user.email);
  try {
    const organization = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: { name, slug, plan: "starter" },
        select: { id: true, name: true, slug: true },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: createdOrg.id,
          identityLinkId: identity.id,
          role: "owner",
        },
      });

      return createdOrg;
    });

    await appendConsoleAudit({
      organizationId: organization.id,
      actorIdentityId: identity.id,
      action: "org_created",
      targetType: "organization",
      targetId: organization.id,
      metadata: { slug: organization.slug, name: organization.name },
    });

    await setActiveOrgCookie(organization.id);

    return NextResponse.json({ organization }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Organization slug already exists" }, { status: 409 });
    }
    throw err;
  }
}
