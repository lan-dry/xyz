"use client";

import { Download, Mail, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { platformApi } from "@/lib/platform-api";

import styles from "./leads-inbox.module.css";

export type LeadRow = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  organization: string | null;
  role: string | null;
  reason: string;
  message: string;
  sourcePath: string;
  status: LeadStatus;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type LeadStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

const PAGE_SIZE = 20;

const REASON_LABELS: Record<string, string> = {
  design_partner: "Design partner",
  investor: "Investor",
  enterprise: "Enterprise",
  press: "Press",
  security: "Security",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  closed: "Closed",
  spam: "Spam",
};

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function exportCsv(leads: LeadRow[]): void {
  const header = ["id", "createdAt", "name", "email", "organization", "reason", "status", "message"];
  const rows = leads.map((l) =>
    [l.id, l.createdAt, l.name, l.email, l.organization ?? "", l.reason, l.status, l.message.replace(/\n/g, " ")]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `salanor-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildLeadsQuery(params: {
  page: number;
  q: string;
  reasonFilter: string;
  statusFilter: LeadStatus | "";
}) {
  const sp = new URLSearchParams();
  sp.set("limit", String(PAGE_SIZE));
  sp.set("offset", String(params.page * PAGE_SIZE));
  if (params.q.trim()) sp.set("q", params.q.trim());
  if (params.reasonFilter) sp.set("reason", params.reasonFilter);
  if (params.statusFilter) sp.set("status", params.statusFilter);
  return `contact-leads?${sp.toString()}`;
}

export function LeadsInbox({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [draftStatus, setDraftStatus] = useState<LeadStatus>("new");
  const [draftNotes, setDraftNotes] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQ, reasonFilter, statusFilter]);

  const leadsQuery = useQuery({
    queryKey: ["platform", "leads", page, debouncedQ, reasonFilter, statusFilter],
    queryFn: () =>
      platformApi<{
        leads: LeadRow[];
        total: number;
        limit: number;
        offset: number;
        stats: { total: number; new: number; week: number };
        source: string;
      }>(buildLeadsQuery({ page, q: debouncedQ, reasonFilter, statusFilter })),
  });

  const saveLead = useMutation({
    mutationFn: (input: { id: string; status: LeadStatus; notes: string }) =>
      platformApi(`contact-leads/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: input.status, notes: input.notes }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "leads"] });
      setSelected(null);
    },
  });

  const leads = leadsQuery.data?.leads ?? [];
  const total = leadsQuery.data?.total ?? 0;
  const stats = leadsQuery.data?.stats ?? { total: 0, new: 0, week: 0 };
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  const exportAll = useMutation({
    mutationFn: async () => {
      const sp = new URLSearchParams();
      sp.set("limit", "500");
      sp.set("offset", "0");
      if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
      if (reasonFilter) sp.set("reason", reasonFilter);
      if (statusFilter) sp.set("status", statusFilter);
      return platformApi<{ leads: LeadRow[] }>(`contact-leads?${sp.toString()}`);
    },
    onSuccess: (data) => exportCsv(data.leads),
  });

  function openLead(lead: LeadRow) {
    setSelected(lead);
    setDraftStatus(lead.status);
    setDraftNotes(lead.notes ?? "");
  }

  return (
    <>
      <div className={ui.statStrip}>
        <span>
          Total <strong>{stats.total}</strong>
        </span>
        <span>
          New <strong>{stats.new}</strong>
        </span>
        <span>
          This week <strong>{stats.week}</strong>
        </span>
      </div>

      <div className={ui.toolbar}>
        <div className={ui.searchWrap}>
          <Search className={ui.searchIcon} size={16} aria-hidden />
          <input
            className={`${ui.input} ${ui.searchInput} ${styles.searchInput}`}
            placeholder="Search name, email, org, message…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search leads"
          />
        </div>
        <select
          className={ui.input}
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          aria-label="Filter by topic"
        >
          <option value="">All topics</option>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={ui.input}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "")}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary}`}
          onClick={() => exportAll.mutate()}
          disabled={exportAll.isPending || stats.total === 0}
        >
          <Download size={16} aria-hidden />
          Export CSV
        </button>
      </div>

      {leadsQuery.data?.source ? (
        <p className={ui.tableFooter} style={{ border: "none", padding: "0 0 1rem" }}>
          Storage: <span className="mono">{leadsQuery.data.source}</span>
        </p>
      ) : null}

      {leadsQuery.isError ? (
        <p className={ui.loading} style={{ color: "var(--console-danger)" }}>
          Could not load leads.
        </p>
      ) : leadsQuery.isLoading ? (
        <p className={ui.loading}>Loading leads…</p>
      ) : stats.total === 0 ? (
        <EmptyStatePanel
          icon={Mail}
          title="No contact submissions yet"
          description="Submit the form on the marketing site (/contact). Messages are stored in PostgreSQL."
        />
      ) : leads.length === 0 ? (
        <p className={ui.empty}>No leads match your filters.</p>
      ) : (
        <>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Contact</th>
                  <th>Organization</th>
                  <th>Topic</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className={styles.when}>{formatWhen(lead.createdAt)}</td>
                    <td>
                      <button type="button" className={styles.nameBtn} onClick={() => openLead(lead)}>
                        {lead.name}
                      </button>
                      <div className={styles.email}>{lead.email}</div>
                    </td>
                    <td>{lead.organization ?? "—"}</td>
                    <td>{REASON_LABELS[lead.reason] ?? lead.reason}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${lead.status}`]}`}>
                        {STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td>
                      <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => openLead(lead)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <p className={styles.pageInfo}>
              Showing {pageStart}–{pageEnd} of {total}
            </p>
            <div className={styles.pageControls}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnGhost}`}
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className={styles.pageNum}>
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnGhost}`}
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selected ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="lead-detail-title">
          <div className={styles.drawer}>
            <header className={styles.drawerHead}>
              <div>
                <h2 id="lead-detail-title" className={styles.drawerTitle}>
                  {selected.name}
                </h2>
                <p className={styles.drawerMeta}>
                  {formatWhen(selected.createdAt)} · {REASON_LABELS[selected.reason] ?? selected.reason}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <dl className={styles.metaGrid}>
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${selected.email}`}>{selected.email}</a>
                </dd>
              </div>
              <div>
                <dt>Organization</dt>
                <dd>{selected.organization ?? "—"}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{selected.role ?? "—"}</dd>
              </div>
              <div>
                <dt>Source page</dt>
                <dd>{selected.sourcePath}</dd>
              </div>
            </dl>

            <section className={styles.messageBlock}>
              <h3>Message</h3>
              <div className={styles.messageBody}>{selected.message}</div>
            </section>

            {canWrite ? (
              <section className={styles.adminBlock}>
                <label className={styles.field}>
                  <span>Status</span>
                  <select
                    className={styles.control}
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value as LeadStatus)}
                  >
                    {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Internal notes</span>
                  <textarea
                    className={styles.notesArea}
                    rows={5}
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Follow-up notes, call summary, next step…"
                  />
                </label>
              </section>
            ) : null}

            <div className={styles.drawerActions}>
              <a className={`${ui.btn} ${ui.btnPrimary}`} href={`mailto:${selected.email}`}>
                <Mail size={16} aria-hidden />
                Reply by email
              </a>
              {canWrite ? (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  disabled={saveLead.isPending}
                  onClick={() =>
                    saveLead.mutate({
                      id: selected.id,
                      status: draftStatus,
                      notes: draftNotes,
                    })
                  }
                >
                  {saveLead.isPending ? "Saving…" : "Save"}
                </button>
              ) : null}
            </div>
            {saveLead.isError ? (
              <p className={styles.error}>{(saveLead.error as Error).message}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
