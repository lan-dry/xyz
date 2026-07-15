"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  ConsoleDataTable,
  ConsoleTableHead,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from "@/components/console/console-data-table";
import { ConsoleEmptyState } from "@/components/console/console-empty-state";
import { consoleAegisPath } from "@/lib/app-paths";
import { formatDateTime } from "@/lib/format-datetime";

export type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function AuditLogPanel({
  entries,
  total,
  page,
  pageSize,
  actions,
  initialQuery,
  initialAction,
}: {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
  initialQuery: string;
  initialAction: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [actionFilter, setActionFilter] = useState(initialAction);

  useEffect(() => {
    setQuery(initialQuery);
    setActionFilter(initialAction);
  }, [initialAction, initialQuery]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const pushParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      startTransition(() => {
        router.push(`${consoleAegisPath("/audit")}?${next.toString()}`);
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = query.trim();
      if (trimmed === initialQuery.trim()) return;
      pushParams({ q: trimmed || undefined, page: "1" });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [initialQuery, pushParams, query]);

  const actionOptions = useMemo(() => ["all", ...actions], [actions]);

  return (
    <div className="space-y-4" data-pending={pending ? "" : undefined}>
      <div className="console-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search action or target"
          className="console-input min-w-64 flex-1"
        />
        <select
          className="console-select"
          value={actionFilter}
          onChange={(event) => {
            const value = event.target.value;
            setActionFilter(value);
            pushParams({ action: value === "all" ? undefined : value, page: "1" });
          }}
        >
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action === "all" ? "All actions" : action}
            </option>
          ))}
        </select>
      </div>

      {entries.length === 0 ? (
        <ConsoleEmptyState title="No audit entries yet" description="Actions across your console will appear here." />
      ) : (
        <ConsoleDataTable>
          <ConsoleTableHead>
            <tr>
              <ConsoleTh>Time</ConsoleTh>
              <ConsoleTh>Action</ConsoleTh>
              <ConsoleTh>Target</ConsoleTh>
            </tr>
          </ConsoleTableHead>
          <tbody>
            {entries.map((row) => (
              <ConsoleTableRow key={row.id}>
                <ConsoleTd className="text-gray-500">{formatDateTime(row.createdAt)}</ConsoleTd>
                <ConsoleTd className="font-mono text-xs text-gray-700">{row.action}</ConsoleTd>
                <ConsoleTd className="font-mono text-xs text-gray-700">
                  {row.targetType ?? "—"}
                  {row.targetId ? ` / ${row.targetId}` : ""}
                </ConsoleTd>
              </ConsoleTableRow>
            ))}
          </tbody>
        </ConsoleDataTable>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <p>
          Page {page} — {rangeStart}–{rangeEnd} of {total} items
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span>Per page</span>
            <select
              className="console-select"
              value={pageSize}
              onChange={(event) => {
                const nextSize = parsePositiveInt(event.target.value, pageSize);
                pushParams({ pageSize: String(nextSize), page: "1" });
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1 || pending}
              onClick={() => pushParams({ page: String(page - 1) })}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page >= totalPages || pending}
              onClick={() => pushParams({ page: String(page + 1) })}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
