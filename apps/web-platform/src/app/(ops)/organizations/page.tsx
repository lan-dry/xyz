"use client";

import { Building2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { useOpsListParams } from "@/hooks/use-ops-list-params";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";
import { CONSOLE_URL } from "@/lib/urls";

import styles from "./organizations.module.css";

type OrgRow = {
  organization_id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  member_count: number;
  events_this_month: number;
  billing_source: string;
  billing_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

type BillingEvent = {
  billing_event_id: string;
  event_type: string;
  plan_slug: string | null;
  external_invoice_ref: string | null;
  note: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

type BillingMode = "pending" | "mark-paid" | "end" | null;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function defaultPeriodDates(): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function OrganizationsPage() {
  const { email, logout, can } = usePlatformSession();
  const canWriteOrgs = can("platform:orgs.write");
  const canImpersonate = can("platform:impersonate");
  const { q, setQuery } = useOpsListParams();
  const [searchInput, setSearchInput] = useState(q);
  const queryClient = useQueryClient();

  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<BillingMode>(null);
  const [planSlug, setPlanSlug] = useState("team");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [note, setNote] = useState("");
  const [periodStart, setPeriodStart] = useState(defaultPeriodDates().start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodDates().end);
  const [endStatus, setEndStatus] = useState<"canceled" | "past_due">("canceled");

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) setQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, setQuery]);

  const orgsQuery = useQuery({
    queryKey: ["platform", "orgs", q],
    queryFn: () =>
      platformApi<{ organizations: OrgRow[] }>(
        `organizations?q=${encodeURIComponent(q)}`,
      ),
  });

  const plansQuery = useQuery({
    queryKey: ["platform", "plan-catalog"],
    queryFn: () =>
      platformApi<{ plans: Array<{ plan_slug: string; display_name: string }> }>(
        "plan-catalog",
      ),
  });
  const planOptions = plansQuery.data?.plans?.length
    ? plansQuery.data.plans
    : [
        { plan_slug: "free", display_name: "Free" },
        { plan_slug: "team", display_name: "Team" },
        { plan_slug: "enterprise", display_name: "Enterprise" },
      ];
  const paidPlanOptions = planOptions.filter((p) => p.plan_slug !== "free");

  const orgs = orgsQuery.data?.organizations ?? [];
  const detailOrg = orgs.find((o) => o.organization_id === detailOrgId) ?? null;

  const eventsQuery = useQuery({
    queryKey: ["platform", "org-billing-events", detailOrgId],
    enabled: Boolean(detailOrgId),
    queryFn: () =>
      platformApi<{ events: BillingEvent[] }>(
        `organizations/${encodeURIComponent(detailOrgId!)}/billing/events?limit=20`,
      ),
  });

  const patchOrg = useMutation({
    mutationFn: (input: { id: string; active?: boolean }) =>
      platformApi(`/organizations/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: input.active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "orgs"] });
    },
  });

  const billingMutation = useMutation({
    mutationFn: async () => {
      if (!detailOrg || !billingMode) throw new Error("No organization selected");
      const id = encodeURIComponent(detailOrg.organization_id);

      if (billingMode === "pending") {
        return platformApi(`/organizations/${id}/billing/pending`, {
          method: "POST",
          body: JSON.stringify({
            plan_slug: planSlug,
            external_invoice_ref: invoiceRef.trim() || undefined,
            note: note.trim() || undefined,
          }),
        });
      }
      if (billingMode === "mark-paid") {
        return platformApi(`/organizations/${id}/billing/mark-paid`, {
          method: "POST",
          body: JSON.stringify({
            plan_slug: planSlug,
            period_start: new Date(`${periodStart}T00:00:00.000Z`).toISOString(),
            period_end: new Date(`${periodEnd}T23:59:59.999Z`).toISOString(),
            external_invoice_ref: invoiceRef.trim() || undefined,
            note: note.trim() || undefined,
          }),
        });
      }
      return platformApi(`/organizations/${id}/billing/end`, {
        method: "POST",
        body: JSON.stringify({
          status: endStatus,
          note: note.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "orgs"] });
      void queryClient.invalidateQueries({
        queryKey: ["platform", "org-billing-events", detailOrgId],
      });
      setBillingMode(null);
    },
  });

  const impersonate = useMutation({
    mutationFn: (organizationId: string) =>
      platformApi<{ handoff_token: string; redirect_url: string }>(
        `organizations/${encodeURIComponent(organizationId)}/impersonate`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${CONSOLE_URL}/api/id/auth/handoff`;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "token";
      input.value = data.handoff_token;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    },
  });

  function openDetail(org: OrgRow) {
    setDetailOrgId(org.organization_id);
    setBillingMode(null);
    billingMutation.reset();
  }

  function closeDetail() {
    setDetailOrgId(null);
    setBillingMode(null);
  }

  function startBilling(mode: Exclude<BillingMode, null>) {
    if (!detailOrg) return;
    setBillingMode(mode);
    setPlanSlug(
      detailOrg.plan !== "free"
        ? detailOrg.plan
        : paidPlanOptions[0]?.plan_slug ?? "team",
    );
    setInvoiceRef("");
    setNote("");
    const dates = defaultPeriodDates();
    setPeriodStart(dates.start);
    setPeriodEnd(dates.end);
    setEndStatus("canceled");
    billingMutation.reset();
  }

  return (
    <OpsShell
      title="Organizations"
      subtitle="Tenants: activate paid plans only after payment clears. Invoices stay external."
      staffEmail={email}
      onLogout={logout}
    >
      <div className={ui.toolbar}>
        <div className={ui.searchWrap}>
          <Search className={ui.searchIcon} size={16} aria-hidden />
          <input
            className={`${ui.input} ${ui.searchInput}`}
            placeholder="Search by name or slug…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search organizations"
          />
        </div>
      </div>

      {orgsQuery.isError ? (
        <p className={ui.loading} style={{ color: "var(--console-danger)" }}>
          Could not load organizations.
        </p>
      ) : null}

      {orgsQuery.isLoading ? (
        <p className={ui.loading}>Loading organizations…</p>
      ) : orgs.length === 0 ? (
        <EmptyStatePanel
          icon={Building2}
          title={q ? "No matching organizations" : "No organizations yet"}
          description={
            q ? "Try another search." : "Provision a design partner to create the first org."
          }
          action={
            !q ? (
              <a href="/provision" className={`${ui.btn} ${ui.btnPrimary}`}>
                Provision org
              </a>
            ) : undefined
          }
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Billing</th>
                <th>Members</th>
                <th>Events</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.organization_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.name}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                      {o.slug}
                    </div>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{o.plan}</td>
                  <td>
                    <span className={styles.billingBadge}>{o.billing_status}</span>
                    <div style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", marginTop: 4 }}>
                      Ends {formatDate(o.current_period_end)}
                    </div>
                  </td>
                  <td>{o.member_count}</td>
                  <td>{o.events_this_month}</td>
                  <td>{o.active ? "Active" : "Suspended"}</td>
                  <td>
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.btnPrimary}`}
                      onClick={() => openDetail(o)}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailOrg ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="org-detail-title"
        >
          <div className={`${styles.panel} ${styles.detailPanel}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2 id="org-detail-title">{detailOrg.name}</h2>
                <p className={styles.panelHint}>
                  <span className="mono">{detailOrg.slug}</span>
                  {" · "}
                  <span className="mono">{detailOrg.organization_id}</span>
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeDetail} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <dl className={styles.metaGrid}>
              <div>
                <dt>Plan</dt>
                <dd style={{ textTransform: "capitalize" }}>{detailOrg.plan}</dd>
              </div>
              <div>
                <dt>Billing</dt>
                <dd>
                  {detailOrg.billing_status}
                  {detailOrg.billing_source !== "none"
                    ? ` · ${detailOrg.billing_source}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  {formatDate(detailOrg.current_period_start)} →{" "}
                  {formatDate(detailOrg.current_period_end)}
                </dd>
              </div>
              <div>
                <dt>Members / events</dt>
                <dd>
                  {detailOrg.member_count} members · {detailOrg.events_this_month} events
                  this month
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detailOrg.active ? "Active" : "Suspended"}</dd>
              </div>
            </dl>

            {!billingMode ? (
              <>
                <div className={styles.actionGroup}>
                  <p className={styles.sectionLabel}>Billing</p>
                  {canWriteOrgs ? (
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        onClick={() => startBilling("pending")}
                      >
                        Record pending
                      </button>
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnPrimary}`}
                        onClick={() => startBilling("mark-paid")}
                      >
                        Mark paid
                      </button>
                      {detailOrg.plan !== "free" ||
                      detailOrg.billing_status === "pending" ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() => startBilling("end")}
                        >
                          End billing
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.panelHint}>No billing write access.</p>
                  )}
                </div>

                <div className={styles.actionGroup}>
                  <p className={styles.sectionLabel}>Support</p>
                  <div className={styles.actionRow}>
                    {canImpersonate && detailOrg.active ? (
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        disabled={impersonate.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Open ${detailOrg.name} in the customer console as support (audited)?`,
                            )
                          ) {
                            impersonate.mutate(detailOrg.organization_id);
                          }
                        }}
                      >
                        {impersonate.isPending ? "Opening…" : "View in console"}
                      </button>
                    ) : null}
                    {canWriteOrgs ? (
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        onClick={() =>
                          patchOrg.mutate({
                            id: detailOrg.organization_id,
                            active: !detailOrg.active,
                          })
                        }
                      >
                        {detailOrg.active ? "Suspend" : "Activate"}
                      </button>
                    ) : null}
                  </div>
                  {impersonate.isError ? (
                    <p style={{ color: "var(--console-danger)", fontSize: "0.875rem" }}>
                      {(impersonate.error as Error).message}
                    </p>
                  ) : null}
                </div>

                <div className={styles.actionGroup}>
                  <p className={styles.sectionLabel}>Billing history</p>
                  {eventsQuery.isLoading ? (
                    <p className={styles.panelHint}>Loading…</p>
                  ) : (eventsQuery.data?.events.length ?? 0) === 0 ? (
                    <p className={styles.panelHint}>No billing events yet.</p>
                  ) : (
                    <ul className={styles.eventList}>
                      {eventsQuery.data!.events.map((e) => (
                        <li key={e.billing_event_id}>
                          <strong>{e.event_type}</strong>
                          {e.plan_slug ? ` · ${e.plan_slug}` : ""}
                          {e.external_invoice_ref
                            ? ` · ${e.external_invoice_ref}`
                            : ""}
                          <span className={styles.eventWhen}>
                            {formatDate(e.created_at)}
                          </span>
                          {e.note ? (
                            <div className={styles.eventNote}>{e.note}</div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className={styles.sectionLabel}>
                  {billingMode === "pending"
                    ? "Record pending"
                    : billingMode === "mark-paid"
                      ? "Mark paid"
                      : "End billing"}
                </p>
                <p className={styles.panelHint}>
                  {billingMode === "pending"
                    ? "Invoice sent externally — plan stays Free until Mark paid."
                    : billingMode === "mark-paid"
                      ? "Payment cleared — unlock plan for the period below."
                      : "Downgrade to Free."}
                </p>

                {billingMode !== "end" ? (
                  <label className={ui.field}>
                    Plan paid for
                    <select
                      className={ui.select}
                      value={planSlug}
                      onChange={(e) => setPlanSlug(e.target.value)}
                    >
                      {paidPlanOptions.map((p) => (
                        <option key={p.plan_slug} value={p.plan_slug}>
                          {p.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className={ui.field}>
                    End as
                    <select
                      className={ui.select}
                      value={endStatus}
                      onChange={(e) =>
                        setEndStatus(e.target.value as "canceled" | "past_due")
                      }
                    >
                      <option value="canceled">Canceled</option>
                      <option value="past_due">Past due</option>
                    </select>
                  </label>
                )}

                {billingMode === "mark-paid" ? (
                  <div className={styles.dateRow}>
                    <label className={ui.field}>
                      Period start
                      <input
                        className={ui.input}
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </label>
                    <label className={ui.field}>
                      Period end
                      <input
                        className={ui.input}
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {billingMode !== "end" ? (
                  <label className={ui.field}>
                    External invoice # (optional)
                    <input
                      className={ui.input}
                      value={invoiceRef}
                      onChange={(e) => setInvoiceRef(e.target.value)}
                      placeholder="INV-1042"
                    />
                  </label>
                ) : null}

                <label className={ui.field}>
                  Note (optional)
                  <input
                    className={ui.input}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Bank transfer cleared"
                  />
                </label>

                {billingMutation.isError ? (
                  <p style={{ color: "var(--console-danger)", fontSize: "0.875rem" }}>
                    {(billingMutation.error as Error).message}
                  </p>
                ) : null}

                <div className={styles.panelActions}>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    onClick={() => setBillingMode(null)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    disabled={billingMutation.isPending}
                    onClick={() => {
                      if (billingMode === "mark-paid") {
                        const label =
                          paidPlanOptions.find((p) => p.plan_slug === planSlug)
                            ?.display_name ?? planSlug;
                        if (
                          !window.confirm(
                            `Confirm payment for ${detailOrg.name}?\n\nActivate ${label} from ${periodStart} to ${periodEnd}.`,
                          )
                        ) {
                          return;
                        }
                      }
                      if (
                        billingMode === "end" &&
                        !window.confirm(
                          `End billing for ${detailOrg.name} and set plan to Free?`,
                        )
                      ) {
                        return;
                      }
                      billingMutation.mutate();
                    }}
                  >
                    {billingMutation.isPending
                      ? "Saving…"
                      : billingMode === "pending"
                        ? "Save pending"
                        : billingMode === "mark-paid"
                          ? "Activate plan"
                          : "Downgrade to Free"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </OpsShell>
  );
}
