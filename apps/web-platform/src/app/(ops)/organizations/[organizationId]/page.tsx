"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";
import { ErrorAlert, LoadingBlock, OpsBackLink, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";
import { CONSOLE_URL } from "@/lib/urls";

type OrgDetail = {
  organization_id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  billing_source: string;
  billing_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  member_count: number;
  events_this_month: number;
  members: Array<{
    membership_id: string;
    account_id: string;
    email: string;
    display_name: string | null;
    role: string;
    status: string;
    joined_at: string;
  }>;
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
  if (!iso) return "Not set";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Not set";
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

export default function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const { email, logout, can } = usePlatformSession();
  const canWriteOrgs = can("platform:orgs.write");
  const canImpersonate = can("platform:impersonate");
  const queryClient = useQueryClient();

  const [billingMode, setBillingMode] = useState<BillingMode>(null);
  const [planSlug, setPlanSlug] = useState("team");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [note, setNote] = useState("");
  const [periodStart, setPeriodStart] = useState(defaultPeriodDates().start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodDates().end);
  const [endStatus, setEndStatus] = useState<"canceled" | "past_due">("canceled");

  const orgQuery = useQuery({
    queryKey: ["platform", "org", organizationId],
    queryFn: () =>
      platformApi<{ organization: OrgDetail }>(
        `organizations/${encodeURIComponent(organizationId)}`,
      ),
    enabled: Boolean(organizationId),
  });

  const eventsQuery = useQuery({
    queryKey: ["platform", "org-billing-events", organizationId],
    queryFn: () =>
      platformApi<{ events: BillingEvent[] }>(
        `organizations/${encodeURIComponent(organizationId)}/billing/events?limit=50`,
      ),
    enabled: Boolean(organizationId),
  });

  const plansQuery = useQuery({
    queryKey: ["platform", "plan-catalog"],
    queryFn: () =>
      platformApi<{ plans: Array<{ plan_slug: string; display_name: string }> }>(
        "plan-catalog",
      ),
  });
  const paidPlanOptions = (plansQuery.data?.plans ?? []).filter(
    (p) => p.plan_slug !== "free",
  );

  const org = orgQuery.data?.organization;

  const patchOrg = useMutation({
    mutationFn: (active: boolean) =>
      platformApi(`/organizations/${encodeURIComponent(organizationId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "org", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "orgs"] });
    },
  });

  const billingMutation = useMutation({
    mutationFn: async () => {
      if (!billingMode) throw new Error("No action selected");
      const id = encodeURIComponent(organizationId);
      if (billingMode === "pending") {
        if (!invoiceRef.trim()) {
          throw new Error("Invoice number is required");
        }
        return platformApi(`/organizations/${id}/billing/pending`, {
          method: "POST",
          body: JSON.stringify({
            plan_slug: planSlug,
            external_invoice_ref: invoiceRef.trim(),
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
      void queryClient.invalidateQueries({ queryKey: ["platform", "org", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "orgs"] });
      void queryClient.invalidateQueries({
        queryKey: ["platform", "org-billing-events", organizationId],
      });
      setBillingMode(null);
    },
  });

  const impersonate = useMutation({
    mutationFn: () =>
      platformApi<{ handoff_token: string }>(
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

  function startBilling(mode: Exclude<BillingMode, null>) {
    setBillingMode(mode);
    setPlanSlug(
      org && org.plan !== "free"
        ? org.plan
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
      title={org?.name ?? "Organization"}
      subtitle={org ? <span className="mono">{org.slug}</span> : undefined}
      staffEmail={email}
      onLogout={logout}
    >
      <OpsBackLink href="/organizations">Back to organizations</OpsBackLink>

      {orgQuery.isLoading ? <LoadingBlock label="Loading organization…" /> : null}
      {orgQuery.isError ? (
        <ErrorAlert message={(orgQuery.error as Error).message} />
      ) : null}

      {org ? (
        <>
          <section className={card.settingCard}>
            <h2>Overview</h2>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 1fr))",
                gap: "1rem",
                margin: 0,
              }}
            >
              <div>
                <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                  Plan
                </dt>
                <dd style={{ margin: "0.2rem 0 0", textTransform: "capitalize" }}>
                  {org.plan}
                </dd>
              </div>
              <div>
                <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                  Billing
                </dt>
                <dd style={{ margin: "0.2rem 0 0" }}>
                  {org.billing_status}
                  {org.billing_source !== "none" ? ` (${org.billing_source})` : ""}
                </dd>
              </div>
              <div>
                <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                  Period
                </dt>
                <dd style={{ margin: "0.2rem 0 0" }}>
                  {formatDate(org.current_period_start)} to{" "}
                  {formatDate(org.current_period_end)}
                </dd>
              </div>
              <div>
                <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                  Status
                </dt>
                <dd style={{ margin: "0.2rem 0 0" }}>
                  {org.active ? "Active" : "Suspended"}
                </dd>
              </div>
              <div>
                <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                  Usage this month
                </dt>
                <dd style={{ margin: "0.2rem 0 0" }}>
                  {org.events_this_month} events · {org.member_count} members
                </dd>
              </div>
              <div>
                <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                  Organization ID
                </dt>
                <dd className="mono" style={{ margin: "0.2rem 0 0", fontSize: "0.75rem" }}>
                  {org.organization_id}
                </dd>
              </div>
              {org.stripe_customer_id ? (
                <div>
                  <dt className={ui.muted} style={{ fontSize: "0.75rem", margin: 0 }}>
                    Stripe customer
                  </dt>
                  <dd className="mono" style={{ margin: "0.2rem 0 0", fontSize: "0.75rem" }}>
                    {org.stripe_customer_id}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className={card.formActions} style={{ marginTop: "1rem" }}>
              {canImpersonate && org.active ? (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  disabled={impersonate.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Open ${org.name} in the customer console as support (audited)?`,
                      )
                    ) {
                      impersonate.mutate();
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
                  onClick={() => patchOrg.mutate(!org.active)}
                >
                  {org.active ? "Suspend" : "Activate"}
                </button>
              ) : null}
            </div>
            {impersonate.isError ? (
              <ErrorAlert message={(impersonate.error as Error).message} />
            ) : null}
          </section>

          <section className={card.settingCard}>
            <h2>Members</h2>
            <p>{org.members.length} account(s) in this organization.</p>
            {org.members.length === 0 ? (
              <p className={ui.muted}>No members.</p>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {org.members.map((m) => (
                      <tr key={m.membership_id}>
                        <td>{m.email}</td>
                        <td>{m.display_name ?? "Not set"}</td>
                        <td style={{ textTransform: "capitalize" }}>{m.role}</td>
                        <td>{m.status}</td>
                        <td>{formatDate(m.joined_at)}</td>
                        <td>
                          <Link
                            href={`/accounts/${m.account_id}`}
                            className={`${ui.btn} ${ui.btnSecondary}`}
                            style={{ fontSize: "0.75rem" }}
                          >
                            Account
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={card.settingCard}>
            <h2>Billing</h2>
            <p>
              Invoices stay outside the platform. Record pending after you send one, then
              mark paid when funds clear.
            </p>

            {!billingMode ? (
              canWriteOrgs ? (
                <div className={card.formActions}>
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
                  {org.plan !== "free" || org.billing_status === "pending" ? (
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
                <p className={ui.muted}>No billing write access.</p>
              )
            ) : (
              <div className={card.formFields}>
                <p className={ui.muted} style={{ margin: 0 }}>
                  {billingMode === "pending"
                    ? "After you send the invoice. Org stays on Free until mark paid."
                    : billingMode === "mark-paid"
                      ? "After payment clears. Choose the plan and paid period."
                      : "Moves the org back to Free."}
                </p>

                {billingMode !== "end" ? (
                  <label className={ui.field}>
                    Plan
                    <select
                      className={ui.select}
                      value={planSlug}
                      onChange={(e) => setPlanSlug(e.target.value)}
                    >
                      {(paidPlanOptions.length
                        ? paidPlanOptions
                        : [
                            { plan_slug: "team", display_name: "Team" },
                            { plan_slug: "enterprise", display_name: "Enterprise" },
                          ]
                      ).map((p) => (
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
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
                    Invoice number{billingMode === "pending" ? " (required)" : " (recommended)"}
                    <input
                      className={ui.input}
                      value={invoiceRef}
                      onChange={(e) => setInvoiceRef(e.target.value)}
                      placeholder="INV-1042"
                      required={billingMode === "pending"}
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
                  <ErrorAlert message={(billingMutation.error as Error).message} />
                ) : null}

                <div className={card.formActions}>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    onClick={() => setBillingMode(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    disabled={billingMutation.isPending}
                    onClick={() => {
                      if (billingMode === "pending" && !invoiceRef.trim()) {
                        window.alert("Enter the invoice number you sent.");
                        return;
                      }
                      if (billingMode === "mark-paid") {
                        if (!invoiceRef.trim()) {
                          if (
                            !window.confirm(
                              "No invoice number entered. Activate the plan anyway?",
                            )
                          ) {
                            return;
                          }
                        }
                        if (
                          !window.confirm(
                            `Confirm payment for ${org.name} and activate ${planSlug} from ${periodStart} to ${periodEnd}?`,
                          )
                        ) {
                          return;
                        }
                      }
                      if (
                        billingMode === "end" &&
                        !window.confirm(`End billing for ${org.name} and set plan to Free?`)
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
              </div>
            )}
          </section>

          <section className={card.settingCard}>
            <h2>Billing history</h2>
            <p>Same events customers see under Settings → Billing.</p>
            {eventsQuery.isLoading ? <p className={ui.muted}>Loading…</p> : null}
            {(eventsQuery.data?.events.length ?? 0) === 0 ? (
              <p className={ui.muted}>No billing events yet.</p>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Plan</th>
                      <th>Invoice</th>
                      <th>Period</th>
                      <th>Date</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsQuery.data!.events.map((e) => (
                      <tr key={e.billing_event_id}>
                        <td>{e.event_type}</td>
                        <td>{e.plan_slug ?? "Not set"}</td>
                        <td className="mono">{e.external_invoice_ref ?? "Not set"}</td>
                        <td>
                          {e.period_start || e.period_end
                            ? `${formatDate(e.period_start)} to ${formatDate(e.period_end)}`
                            : "Not set"}
                        </td>
                        <td>{formatDate(e.created_at)}</td>
                        <td>{e.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {orgQuery.isSuccess && !org ? (
        <>
          <ErrorAlert message="Organization not found." />
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={() => router.push("/organizations")}
          >
            Back
          </button>
        </>
      ) : null}
    </OpsShell>
  );
}
