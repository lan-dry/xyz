"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { idApi } from "@/lib/id-api";
import { MARKETING_URL } from "@/lib/site-urls";
import type { MeResponse } from "@/lib/types";

import settings from "../settings.module.css";

type PlanUpgradeOption = {
  plan_slug: string;
  display_name: string;
  events_per_month: number | null;
  max_ingest_keys: number;
  max_members: number;
  checkout_ready: boolean;
};

type PlanUsage = {
  plan: string;
  display_name: string;
  active: boolean;
  usage: {
    events_this_month: number;
    ingest_keys: number;
    members: number;
  };
  limits: {
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
  };
  self_serve: boolean;
  billing_checkout_enabled: boolean;
  billing_portal_available: boolean;
  billing_source?: "none" | "manual" | "stripe";
  billing_status?: "none" | "pending" | "active" | "past_due" | "canceled";
  current_period_start?: string | null;
  current_period_end?: string | null;
  upgrade_options: PlanUpgradeOption[];
  contact_sales_plans: Array<{ plan_slug: string; display_name: string }>;
};

type BillingHistoryItem = {
  id: string;
  title: string;
  plan_slug: string | null;
  invoice_ref: string | null;
  period_start: string | null;
  period_end: string | null;
  recorded_at: string;
};

function formatDate(iso: string | null | undefined): string {
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

function UsageMeter({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}) {
  const pct =
    cap != null && cap > 0 ? Math.min(100, (used / cap) * 100) : null;
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <p className={ui.muted} style={{ fontSize: "0.8125rem", margin: "0 0 0.35rem" }}>
        {label}: {used}
        {cap != null ? ` / ${cap}` : " (unlimited)"}
      </p>
      {pct != null ? (
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "var(--console-border, #e2e8f0)",
            maxWidth: "22rem",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 3,
              background:
                pct >= 90
                  ? "var(--console-danger, #b91c1c)"
                  : "var(--console-accent, #2563eb)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading billing…</p>}>
      <BillingSettingsInner />
    </Suspense>
  );
}

function BillingSettingsInner() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const planQuery = useQuery({
    queryKey: ["console", "plan-usage"],
    queryFn: () => consoleApi<{ plan_usage: PlanUsage }>("/organization/plan-usage"),
  });

  const historyQuery = useQuery({
    queryKey: ["console", "billing-history"],
    queryFn: () =>
      consoleApi<{ history: BillingHistoryItem[] }>("/organization/billing-history"),
  });

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setBanner("Payment received. Your plan should update shortly.");
      void queryClient.invalidateQueries({ queryKey: ["console", "plan-usage"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "billing-history"] });
    } else if (checkout === "cancel") {
      setBanner("Checkout was canceled. Nothing changed.");
    }
  }, [searchParams, queryClient]);

  const checkout = useMutation({
    mutationFn: async (planSlug: string) => {
      const orgId = meQuery.data?.organization.organization_id;
      if (!orgId) throw new Error("No organization");
      const res = await fetch("/api/billing/checkout/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: orgId, plan_slug: planSlug }),
      });
      const data = (await res.json()) as { checkout_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.checkout_url) window.location.href = data.checkout_url;
    },
  });

  const portal = useMutation({
    mutationFn: async () => {
      const orgId = meQuery.data?.organization.organization_id;
      if (!orgId) throw new Error("No organization");
      const res = await fetch("/api/billing/portal/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: orgId }),
      });
      const data = (await res.json()) as { portal_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Billing portal failed");
      if (data.portal_url) window.location.href = data.portal_url;
    },
  });

  if (meQuery.isError) {
    return <ErrorAlert message="Failed to load billing." />;
  }

  const usage = planQuery.data?.plan_usage;
  const isAdmin = meQuery.data?.user.role === "admin";
  const checkoutEnabled = usage?.billing_checkout_enabled !== false;
  const readyUpgrades =
    usage?.upgrade_options.filter((o) => o.checkout_ready) ?? [];
  const pendingPriceSetup =
    (usage?.upgrade_options.some((o) => !o.checkout_ready) ?? false) &&
    readyUpgrades.length === 0;
  const isManualBilling =
    usage?.billing_source === "manual" &&
    (usage.billing_status === "active" || usage.billing_status === "pending");
  const history = historyQuery.data?.history ?? [];

  return (
    <>
      <section className={settings.settingCard}>
        <h2>Plan and billing</h2>
        <p>
          Free is enough to try Aegis. Move to a paid plan when you need higher limits.
        </p>
        {banner ? (
          <p
            className={`${ui.alert} ${ui.alertInfo}`}
            style={{ marginBottom: "1rem", fontSize: "0.875rem" }}
          >
            {banner}
          </p>
        ) : null}
        {planQuery.isLoading ? <p className={ui.muted}>Loading plan…</p> : null}
        {planQuery.isError ? (
          <ErrorAlert message={(planQuery.error as Error).message} />
        ) : null}
        {usage ? (
          <>
            <p style={{ margin: "0 0 1rem" }}>
              Current plan: <strong>{usage.display_name}</strong>{" "}
              <span className="mono">({usage.plan})</span>
              {!usage.active ? (
                <span style={{ color: "var(--console-danger, #b91c1c)" }}>
                  {" "}
                  (suspended)
                </span>
              ) : null}
            </p>

            {isManualBilling ? (
              <p
                className={`${ui.alert} ${ui.alertInfo}`}
                style={{ marginBottom: "1rem", fontSize: "0.875rem" }}
              >
                {usage.billing_status === "pending" ? (
                  <>
                    We sent an invoice for this organization. You stay on Free until
                    payment is confirmed.
                  </>
                ) : (
                  <>
                    You are billed by Salanor invoice.
                    {usage.current_period_start || usage.current_period_end ? (
                      <>
                        {" "}
                        Current period:{" "}
                        <strong>
                          {formatDate(usage.current_period_start)} to{" "}
                          {formatDate(usage.current_period_end)}
                        </strong>
                        .
                      </>
                    ) : null}{" "}
                    For renewals or changes,{" "}
                    <a href={`${MARKETING_URL}/contact`}>contact sales</a>.
                  </>
                )}
              </p>
            ) : null}

            <UsageMeter
              label="Events this month"
              used={usage.usage.events_this_month}
              cap={usage.limits.events_per_month}
            />
            <UsageMeter
              label="API keys"
              used={usage.usage.ingest_keys}
              cap={usage.limits.max_ingest_keys}
            />
            <UsageMeter
              label="Members"
              used={usage.usage.members}
              cap={usage.limits.max_members}
            />
            <p className={ui.muted} style={{ fontSize: "0.8125rem", marginTop: 0 }}>
              Event retention: {usage.limits.retention_days} days
            </p>

            {isAdmin ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "1.25rem",
                }}
              >
                {checkoutEnabled && readyUpgrades.length > 0 && !isManualBilling ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {readyUpgrades.map((opt) => (
                      <button
                        key={opt.plan_slug}
                        type="button"
                        className={`${ui.btn} ${ui.btnPrimary}`}
                        disabled={checkout.isPending}
                        onClick={() => checkout.mutate(opt.plan_slug)}
                      >
                        {checkout.isPending
                          ? "Redirecting…"
                          : `Upgrade to ${opt.display_name}`}
                      </button>
                    ))}
                  </div>
                ) : null}

                {usage.billing_portal_available && usage.billing_source !== "manual" ? (
                  <div>
                    <button
                      type="button"
                      className={ui.btn}
                      disabled={portal.isPending}
                      onClick={() => portal.mutate()}
                    >
                      {portal.isPending
                        ? "Opening…"
                        : "Stripe invoices and payment methods"}
                    </button>
                  </div>
                ) : null}

                {checkout.isError ? (
                  <ErrorAlert message={(checkout.error as Error).message} />
                ) : null}
                {portal.isError ? (
                  <ErrorAlert message={(portal.error as Error).message} />
                ) : null}

                {!isManualBilling &&
                (usage.contact_sales_plans.length > 0 || pendingPriceSetup) ? (
                  <p style={{ margin: 0, fontSize: "0.875rem" }}>
                    Need{" "}
                    {[
                      ...usage.contact_sales_plans.map((p) => p.display_name),
                      ...(pendingPriceSetup && readyUpgrades.length === 0
                        ? ["Team"]
                        : []),
                    ]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(" or ")}
                    ?{" "}
                    <a href={`${MARKETING_URL}/contact`}>Contact sales</a>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className={ui.muted} style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
                Ask an organization admin to change billing.
              </p>
            )}
          </>
        ) : null}
      </section>

      <section className={settings.settingCard}>
        <h2>Billing history</h2>
        <p>
          What changed on your plan, when it was recorded, and any invoice reference we
          have on file.
        </p>
        {historyQuery.isLoading ? (
          <p className={ui.muted}>Loading history…</p>
        ) : null}
        {historyQuery.isError ? (
          <ErrorAlert message={(historyQuery.error as Error).message} />
        ) : null}
        {!historyQuery.isLoading && history.length === 0 ? (
          <p className={ui.muted} style={{ fontSize: "0.875rem" }}>
            No billing events yet. When you are invoiced or a payment is confirmed, it
            will show up here.
          </p>
        ) : null}
        {history.length > 0 ? (
          <div className={ui.tableWrap} style={{ marginTop: "0.75rem" }}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Plan</th>
                  <th>Invoice</th>
                  <th>Period</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.plan_slug ?? "Not set"}</td>
                    <td className="mono">{row.invoice_ref ?? "Not set"}</td>
                    <td>
                      {row.period_start || row.period_end
                        ? `${formatDate(row.period_start)} to ${formatDate(row.period_end)}`
                        : "Not set"}
                    </td>
                    <td>{formatDate(row.recorded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {usage?.billing_source === "stripe" && usage.billing_portal_available ? (
          <p className={ui.muted} style={{ fontSize: "0.8125rem", marginTop: "0.75rem" }}>
            Card receipts and Stripe invoices are also available under{" "}
            <strong>Stripe invoices and payment methods</strong>.
          </p>
        ) : null}
      </section>

      <section className={settings.settingCard}>
        <h2>How payment works</h2>
        <ul className={ui.muted} style={{ fontSize: "0.875rem", paddingLeft: "1.25rem", margin: 0 }}>
          {isManualBilling ? (
            <>
              <li>Salanor invoices you outside the console (bank transfer or similar).</li>
              <li>Your plan unlocks after we confirm payment, and the history above updates.</li>
              <li>Renewals and plan changes go through sales.</li>
            </>
          ) : (
            <>
              <li>Self-serve upgrades use Stripe when configured. We do not store full card numbers.</li>
              <li>Larger deals are invoiced by Salanor; the plan activates after payment is confirmed.</li>
              <li>If you pay with Stripe, use the portal for receipts and payment methods.</li>
            </>
          )}
        </ul>
      </section>

      <section className={settings.settingCard}>
        <h2>Organization profile</h2>
        <p>
          Rename your organization or create another tenant from{" "}
          <Link href="/aegis/settings/organization">Organization settings</Link>.
        </p>
      </section>
    </>
  );
}
