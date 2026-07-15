import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePageSize(raw: string | null): number {
  const parsed = parsePositiveInt(raw, 25);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : 25;
}

export async function GET(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = resolvePageSize(searchParams.get("pageSize"));
  const query = searchParams.get("q")?.trim() ?? "";
  const action = searchParams.get("action")?.trim() ?? "all";

  return withConsoleOrg(ctx.activeOrgId, "compliance", async (scoped) => {
    const where: Prisma.ConsoleAuditLogWhereInput = {
      organizationId: scoped.activeOrgId,
      ...(action !== "all" ? { action } : {}),
      ...(query
        ? {
            OR: [
              { action: { contains: query, mode: "insensitive" } },
              { targetType: { contains: query, mode: "insensitive" } },
              { targetId: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.consoleAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.consoleAuditLog.count({ where }),
    ]);

    return NextResponse.json({
      entries: rows,
      total,
      page,
      pageSize,
    });
  });
}
