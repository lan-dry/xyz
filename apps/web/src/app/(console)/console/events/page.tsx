import Link from "next/link";

import { consoleInkCtaClass } from "@/components/console/console-cta";
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
import { listOrgEvents } from "@/lib/console/events";
import { consoleAegisPath } from "@/lib/app-paths";
import { resolveConsoleContext } from "@/lib/console/session";
import { formatDateTime } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

export default async function ConsoleEventsPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const [events, hasActivePolicy] = await Promise.all([
    listOrgEvents(ctx.activeOrgId, 100),
    prisma.aegisPolicy.findFirst({
      where: { organizationId: ctx.activeOrgId, enabled: true },
      select: { id: true },
    }),
  ]);

  return (
    <section className="space-y-5">
      <ConsolePageHeader
        title="Events"
        subtitle="Verifiable decision records from ingest (tenant ledger). Not console admin activity — see Audit log."
      />

      <div className="flex flex-wrap items-center gap-2">
        {hasActivePolicy ? (
          <StatusChip tone="positive">Policy enforced at ingest</StatusChip>
        ) : null}
      </div>

      <div className="console-toolbar">
        <input
          type="search"
          placeholder="Search event ID or trace ID"
          className="console-input min-w-64 flex-1"
        />
        <select className="console-select">
          <option>All status</option>
          <option>Accepted</option>
        </select>
      </div>

      {events.length === 0 ? (
        <ConsoleEmptyState
          title="No events yet"
          description="Create an API key and ingest a demo payload to start seeing event logs."
          action={
            <Link
              href={consoleAegisPath("/api-keys")}
              className={`inline-flex rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150 ${consoleInkCtaClass}`}
            >
              Create API key
            </Link>
          }
        />
      ) : (
        <ConsoleDataTable>
          <ConsoleTableHead>
            <tr>
              <ConsoleTh>Received</ConsoleTh>
              <ConsoleTh>Event ID</ConsoleTh>
              <ConsoleTh>Trace ID</ConsoleTh>
              <ConsoleTh>Status</ConsoleTh>
            </tr>
          </ConsoleTableHead>
          <tbody>
            {events.map((row) => (
              <ConsoleTableRow key={row.rowId}>
                <ConsoleTd className="whitespace-nowrap text-gray-500">{formatDateTime(row.receivedAt)}</ConsoleTd>
                <ConsoleTd className="font-mono text-xs text-gray-700">{row.eventId}</ConsoleTd>
                <ConsoleTd className="font-mono text-xs text-gray-700">{row.traceId}</ConsoleTd>
                <ConsoleTd>
                  <StatusChip tone="positive">accepted</StatusChip>
                </ConsoleTd>
              </ConsoleTableRow>
            ))}
          </tbody>
        </ConsoleDataTable>
      )}
    </section>
  );
}
