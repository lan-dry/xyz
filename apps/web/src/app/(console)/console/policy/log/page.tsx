import Link from "next/link";

import {
  ConsoleDataTable,
  ConsoleTableHead,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from "@/components/console/console-data-table";
import { ConsoleEmptyState } from "@/components/console/console-empty-state";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { StatusChip } from "@/components/console/status-chip";
import { consoleAegisPath } from "@/lib/app-paths";
import { resolveConsoleContext } from "@/lib/console/session";
import { formatDateTime } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

function summarizeViolations(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? value.join("; ") : "none";
  }
  if (value && typeof value === "object" && "violations" in value) {
    const record = value as Record<string, unknown>;
    const nested = record.violations;
    if (Array.isArray(nested)) {
      const surface = typeof record.surface === "string" ? record.surface : "unknown";
      return nested.length ? `[${surface}] ${nested.join("; ")}` : `[${surface}] none`;
    }
  }
  if (value == null) {
    return "none";
  }
  return JSON.stringify(value);
}

export default async function ConsolePolicyLogPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const rows = await prisma.policyEvaluationLog.findMany({
    where: { organizationId: ctx.activeOrgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      eventId: true,
      traceId: true,
      decision: true,
      violations: true,
    },
  });

  return (
    <section className="space-y-5">
      <ConsolePageHeader
        title="Policy log"
        subtitle="Recent ingest and replay policy outcomes for this organization."
        actions={
          <Link
            href={consoleAegisPath("/policy")}
            className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 no-underline transition-colors duration-150 hover:bg-gray-50"
          >
            Back to policy
          </Link>
        }
      />
      <div className="console-toolbar">
        <input className="console-input min-w-64 flex-1" placeholder="Search event or trace ID" type="search" />
        <select className="console-select">
          <option>All decisions</option>
          <option>allow</option>
          <option>deny</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <ConsoleEmptyState
          title="No policy evaluations yet"
          description="Policy decisions will appear here once events are evaluated."
        />
      ) : (
        <ConsoleDataTable>
          <ConsoleTableHead>
            <tr>
              <ConsoleTh>Time</ConsoleTh>
              <ConsoleTh>Event ID</ConsoleTh>
              <ConsoleTh>Trace ID</ConsoleTh>
              <ConsoleTh>Decision</ConsoleTh>
              <ConsoleTh>Violations</ConsoleTh>
            </tr>
          </ConsoleTableHead>
          <tbody>
            {rows.map((row) => (
              <ConsoleTableRow key={row.id}>
                <ConsoleTd className="whitespace-nowrap text-gray-500">{formatDateTime(row.createdAt)}</ConsoleTd>
                <ConsoleTd className="font-mono text-xs text-gray-700">{row.eventId}</ConsoleTd>
                <ConsoleTd className="font-mono text-xs text-gray-700">{row.traceId}</ConsoleTd>
                <ConsoleTd>
                  <StatusChip tone={row.decision === "deny" ? "critical" : "positive"}>{row.decision}</StatusChip>
                </ConsoleTd>
                <ConsoleTd className="text-xs text-muted">{summarizeViolations(row.violations)}</ConsoleTd>
              </ConsoleTableRow>
            ))}
          </tbody>
        </ConsoleDataTable>
      )}
    </section>
  );
}
