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
  upgrade_options: PlanUpgradeOption[];
  contact_sales_plans: Array<{ plan_slug: string; display_name: string }>;
};

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

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setBanner("Payment received. Your plan updates within a minute after Stripe confirms.");
      void queryClient.invalidateQueries({ queryKey: ["console", "plan-usage"] });
    } else if (checkout === "cancel") {
      setBanner("Checkout canceled. Your plan was not changed.");
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
  const checkoutEnabled =
    usage?.billing_checkout_enabled ||
    process.env.NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED === "1";

  return (
    <>
      <section className={settings.settingCard}>
        <h2>Plan & billing</h2>
        <p>
          Free includes enough capacity to evaluate Aegis. Upgrade when you need higher
          ingest, more API keys, or more seats.
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
                  — suspended
                </span>
              ) : null}
            </p>

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

            {isAdmin && checkoutEnabled ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "1.25rem",
                }}
              >
                {usage.upgrade_options.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {usage.upgrade_options.map((opt) => (
                      <button
                        key={opt.plan_slug}
                        type="button"
                        className={`${ui.btn} ${ui.btnPrimary}`}
                        disabled={
                          checkout.isPending || !opt.checkout_ready
                        }
                        title={
                          opt.checkout_ready
                            ? undefined
                            : "Stripe price not configured yet — ask Salanor ops"
                        }
                        onClick={() => checkout.mutate(opt.plan_slug)}
                      >
                        {checkout.isPending
                          ? "Redirecting…"
                          : `Upgrade to ${opt.display_name}`}
                      </button>
                    ))}
                  </div>
                ) : null}
                {usage.billing_portal_available ? (
                  <div>
                    <button
                      type="button"
                      className={ui.btn}
                      disabled={portal.isPending}
                      onClick={() => portal.mutate()}
                    >
                      {portal.isPending
                        ? "Opening…"
                        : "Manage billing (invoices & payment)"}
                    </button>
                  </div>
                ) : null}
                {checkout.isError ? (
                  <ErrorAlert message={(checkout.error as Error).message} />
                ) : null}
                {portal.isError ? (
                  <ErrorAlert message={(portal.error as Error).message} />
                ) : null}
              </div>
            ) : null}

            {isAdmin && usage.contact_sales_plans.length > 0 ? (
              <p style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
                Need{" "}
                {usage.contact_sales_plans.map((p) => p.display_name).join(" / ")}?{" "}
                <a href={`${MARKETING_URL}/contact`}>Contact sales</a>
              </p>
            ) : null}

            {!checkoutEnabled ? (
              <p className={ui.muted} style={{ marginTop: "0.75rem", fontSize: "0.75rem" }}>
                Self-serve checkout is currently off. Salanor ops can change your plan in
                Platform → Organizations.
              </p>
            ) : null}

            {!isAdmin ? (
              <p className={ui.muted} style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
                Ask an organization admin to upgrade or manage billing.
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className={settings.settingCard}>
        <h2>How payment works</h2>
        <ul className={ui.muted} style={{ fontSize: "0.875rem", paddingLeft: "1.25rem", margin: 0 }}>
          <li>
            Checkout runs on <strong>Stripe</strong> (card). Salanor never stores full card
            numbers.
          </li>
          <li>
            After upgrade, use <strong>Manage billing</strong> for invoices, receipts, and
            updating the card. Stripe can save the payment method for renewals.
          </li>
          <li>
            Team is billed as a <strong>subscription</strong> (monthly by default, set on the
            Stripe price). Failed payments are handled in Stripe; your plan may fall back to
            Free if unpaid.
          </li>
          <li>
            PayPal and other wallets appear only if you enable them in the Stripe Dashboard
            (Payment methods).
          </li>
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
