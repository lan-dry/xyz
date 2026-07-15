import { NextResponse } from "next/server";

import { isAdminContactStatus } from "@/lib/admin/contact-status";
import { requireAdminApiPermission } from "@/lib/admin/require-admin-api";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApiPermission("admin:contacts:write");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { status?: string; adminNotes?: string }
    | null;

  if (!body || !isAdminContactStatus(body.status ?? "")) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { id } = await params;
  const updated = await prisma.contactMessage
    .update({
      where: { id },
      data: {
        status: body.status,
        adminNotes: body.adminNotes?.slice(0, 4000) ?? null,
      },
      select: { id: true, status: true, adminNotes: true },
    })
    .catch(() => null);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
