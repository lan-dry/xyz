"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/console/button";

type BillingSummary = {
  plan: string;
  billingStatus: "none" | "trialing" | "active" | "past_due" | "canceled";
  hasCustomer: boolean;
  usage: {
    eventsThisMonth: number | null;
    seats: number | null;
  };
};

export function BillingPanel({
  initial,
  canManageBilling,
  checkoutEnabled,
}: {
  initial: BillingSummary;
  canManageBilling: boolean;
  checkoutEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const prettyStatus = useMemo(() => initial.billingStatus.replaceAll("_", " "), [initial.billingStatus]);

  return (
    <div className="space-y-6">
      <div className="console-alert-warning rounded-xl p-4 text-sm">
        Billing is in test mode — no real charges unless you use live keys.
      </div>

      <div className="rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-5">
        <h3 className="text-base font-semibold text-[var(--console-fg)]">Current plan</h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink/60">Plan</dt>
            <dd className="font-medium text-ink">{initial.plan || "starter"}</dd>
          </div>
          <div>
            <dt className="text-ink/60">Billing status</dt>
            <dd className="font-medium capitalize text-ink">{prettyStatus || "none"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-5">
        <h3 className="text-base font-semibold text-[var(--console-fg)]">Usage (placeholder)</h3>
        <p className="mt-2 text-sm text-ink/70">Usage metering is not yet enabled for this scaffold.</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink/60">Events this month</dt>
            <dd className="text-ink">{initial.usage.eventsThisMonth ?? "n/a"}</dd>
          </div>
          <div>
            <dt className="text-ink/60">Seats</dt>
            <dd className="text-ink">{initial.usage.seats ?? "n/a"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-5">
        <h3 className="text-base font-semibold text-[var(--console-fg)]">Actions</h3>
        <p className="mt-2 text-sm text-ink/70">
          Upgrade your organization to Pro or manage subscription details in Stripe.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pending || !canManageBilling || !checkoutEnabled}
            onClick={() => {
              setError(null);
              setInfo(null);
              startTransition(async () => {
                const res = await fetch("/api/console/billing/checkout", { method: "POST" });
                const payload = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
                if (!res.ok || !payload.url) {
                  setError(payload.error ?? "Unable to create checkout session.");
                  return;
                }
                window.location.href = payload.url;
              });
            }}
          >
            Upgrade to Pro
          </Button>
          {initial.hasCustomer ? (
            <Button
              type="button"
              disabled={pending || !canManageBilling}
              variant="secondary"
              onClick={() => {
                setError(null);
                setInfo(null);
                startTransition(async () => {
                  const res = await fetch("/api/console/billing/portal", { method: "POST" });
                  const payload = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
                  if (!res.ok || !payload.url) {
                    setError(payload.error ?? "Unable to open billing portal.");
                    return;
                  }
                  window.location.href = payload.url;
                });
              }}
            >
              Manage billing
            </Button>
          ) : null}
        </div>

        {!canManageBilling ? (
          <p className="mt-3 text-sm text-ink/70">Billing changes require admin or owner role.</p>
        ) : null}
        {canManageBilling && !checkoutEnabled ? (
          <p className="mt-3 text-sm text-ink/70">Checkout is disabled until a Stripe Pro price ID is configured.</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {info ? <p className="mt-3 text-sm text-emerald-700">{info}</p> : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="w-fit"
        onClick={() => {
          router.refresh();
        }}
      >
        Refresh billing state
      </Button>
    </div>
  );
}
