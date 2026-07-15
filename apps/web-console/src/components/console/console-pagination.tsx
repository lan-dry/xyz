"use client";

import {
  TRACE_PAGE_SIZES,
  type TracePageSize,
} from "@/hooks/use-trace-list-params";
import { ui } from "@/components/console/console-ui";

function pageItems(current: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const set = new Set<number>([
    1,
    pageCount,
    current,
    current - 1,
    current + 1,
  ]);
  const sorted = [...set].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const items: Array<number | "…"> = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (i > 0 && p - sorted[i - 1]! > 1) {
      items.push("…");
    }
    items.push(p);
  }
  return items;
}

export function ConsolePagination({
  total,
  limit,
  page,
  onPageChange,
  onLimitChange,
  noun = "trace",
  pageSizes = TRACE_PAGE_SIZES,
}: {
  total: number;
  limit: number;
  page: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  noun?: string;
  pageSizes?: readonly number[];
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(safePage * limit, total);
  const plural = total === 1 ? noun : `${noun}s`;

  return (
    <div
      className={ui.tableFooter}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <span>
        {total === 0
          ? `No ${plural}`
          : `Showing ${from}–${to} of ${total} ${plural}`}
      </span>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.8125rem",
          }}
        >
          Per page
          <select
            className={ui.input}
            style={{ width: "auto", padding: "0.35rem 0.5rem" }}
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Pagination" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            First
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </button>
          {pageItems(safePage, pageCount).map((item, idx) =>
            item === "…" ? (
              <span
                key={`ellipsis-${idx}`}
                style={{ padding: "0 0.25rem", color: "var(--console-fg-subtle)" }}
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`${ui.btn} ${item === safePage ? ui.btnPrimary : ui.btnSecondary}`}
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(pageCount)}
            aria-label="Last page"
          >
            Last
          </button>
        </nav>
      </div>
    </div>
  );
}
