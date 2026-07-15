"use client";

import { OPS_PAGE_SIZES, type OpsPageSize } from "@/hooks/use-ops-list-params";
import { ui } from "@/components/ops-ui/ops-ui";

export function OpsPagination({
  total,
  limit,
  page,
  onPageChange,
  onLimitChange,
}: {
  total: number;
  limit: number;
  page: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: OpsPageSize) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

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
          ? "No results"
          : `Showing ${from}–${to} of ${total} · page ${page} of ${pageCount}`}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
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
            className={ui.select}
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value) as OpsPageSize)}
            aria-label="Rows per page"
          >
            {OPS_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
