import { Suspense } from "react";
import type { Prisma } from "@prisma/client";

import { AuditLogPanel } from "@/components/console/audit-log-panel";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { resolveConsoleContext } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePageSize(raw: string | undefined): number {
  const parsed = parsePositiveInt(raw, 25);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : 25;
}

export default async function ConsoleAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string; action?: string }>;
}) {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const params = await searchParams;
  const page = parsePositiveInt(params.page, 1);
  const pageSize = resolvePageSize(params.pageSize);
  const query = params.q?.trim() ?? "";
  const action = params.action?.trim() ?? "all";

  const where: Prisma.ConsoleAuditLogWhereInput = {
    organizationId: ctx.activeOrgId,
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

  const [entries, total, actionRows] = await Promise.all([
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
        createdAt: true,
      },
    }),
    prisma.consoleAuditLog.count({ where }),
    prisma.consoleAuditLog.findMany({
      where: { organizationId: ctx.activeOrgId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  const serializedEntries = entries.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <section className="space-y-6">
      <ConsolePageHeader
        title="Audit log"
        subtitle="Append-only record of console actions (AUTH-A3 will extend auth events)."
      />
      <Suspense fallback={<p className="text-sm text-gray-500">Loading audit log…</p>}>
        <AuditLogPanel
          key={ctx.activeOrgId}
          entries={serializedEntries}
          total={total}
          page={page}
          pageSize={pageSize}
          actions={actionRows.map((row) => row.action)}
          initialQuery={query}
          initialAction={action}
        />
      </Suspense>
    </section>
  );
}
