import { NextResponse } from "next/server";

import { appendAdminAudit } from "@/lib/admin/audit";
import { requireAdminApiPermission } from "@/lib/admin/require-admin-api";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApiPermission("admin:users:suspend");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { suspend?: boolean } | null;
  if (body === null || typeof body.suspend !== "boolean") {
    return NextResponse.json({ error: "suspend boolean required" }, { status: 400 });
  }

  const { id } = await params;
  if (id === admin.userId) {
    return NextResponse.json({ error: "Cannot suspend your own account" }, { status: 400 });
  }

  const updated = await prisma.user
    .update({
      where: { id },
      data: {
        platformSuspendedAt: body.suspend ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        platformSuspendedAt: true,
      },
    })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await appendAdminAudit({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    action: body.suspend ? "admin.user.suspended" : "admin.user.unsuspended",
    targetUserId: updated.id,
    metadata: { targetEmail: updated.email },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    platformSuspendedAt: updated.platformSuspendedAt?.toISOString() ?? null,
  });
}
