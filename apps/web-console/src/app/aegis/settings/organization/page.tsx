"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { IdApiError, idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

import settings from "../settings.module.css";

type PlanUsage = {
  plan: string;
  display_name: string;
  active: boolean;
  usage: { events_this_month: number };
  limits: {
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
  };
  self_serve: boolean;
  billing_checkout_enabled: boolean;
  billing_portal_available: boolean;
};

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const [newOrgName, setNewOrgName] = useState("");
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSlugTouched, setEditSlugTouched] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const planQuery = useQuery({
    queryKey: ["console", "plan-usage"],
    queryFn: () => consoleApi<{ plan_usage: PlanUsage }>("/organization/plan-usage"),
  });

  const checkout = useMutation({
    mutationFn: async (planSlug: string) => {
      const orgId = meQuery.data?.organization.organization_id;
      if (!orgId) throw new Error("No organization");
      const res = await fetch("/api/billing/checkout/session", {
        method: "POST",
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: orgId }),
      });
      const data = (await res.json()) as { portal_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Billing portal failed");
      if (data.portal_url) window.location.href = data.portal_url;
    },
  });

  const updateOrg = useMutation({
    mutationFn: async (input: { organization_name?: string; organization_slug?: string }) => {
      const orgId = meQuery.data?.organization.organization_id;
      if (!orgId) throw new Error("No organization");
      return idApi<{
        ok: boolean;
        organization: { name: string; slug: string };
        slug_changed?: boolean;
        message?: string;
      }>(`/orgs/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    onSuccess: (data) => {
      setEditMessage(data.message ?? "Organization updated.");
      void queryClient.invalidateQueries({ queryKey: ["id"] });
      void queryClient.invalidateQueries({ queryKey: ["console"] });
    },
    onError: (err: Error) => {
      setEditMessage(err instanceof IdApiError ? err.message : "Could not update organization.");
    },
  });

  const createOrg = useMutation({
    mutationFn: async (organizationName: string) => {
      return idApi<MeResponse>("/orgs/create", {
        method: "POST",
        body: JSON.stringify({ organization_name: organizationName }),
      });
    },
    onSuccess: () => {
      setNewOrgName("");
      void queryClient.invalidateQueries({ queryKey: ["id"] });
      void queryClient.invalidateQueries({ queryKey: ["console"] });
    },
  });

  if (meQuery.isError) {
    return <ErrorAlert message="Failed to load organization." />;
  }

  const org = meQuery.data?.organization;
  const usage = planQuery.data?.plan_usage;
  const isAdmin = meQuery.data?.user.role === "admin";
  const onboardingDone = org && !org.needs_onboarding;

  useEffect(() => {
    if (org) {
      setEditName(org.name);
      setEditSlug(org.slug);
      setEditSlugTouched(false);
      setEditMessage(null);
    }
  }, [org?.organization_id]);
  const eventCap = usage?.limits.events_per_month;
  const eventUsed = usage?.usage.events_this_month ?? 0;
  const eventPct =
    eventCap != null && eventCap > 0 ? Math.min(100, (eventUsed / eventCap) * 100) : null;

  return (
    <>
      <section className={settings.settingCard}>
        <h2>Organization</h2>
        <p>Your active organization scope for Aegis data, policies, and exports.</p>
        {org ? (
          <dl className={ui.formGrid} style={{ maxWidth: "28rem", gap: "0.75rem" }}>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Name
              </dt>
              <dd style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>{org.name}</dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Slug
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }} className="mono">
                {org.slug}
              </dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Organization ID
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }} className="mono">
                {org.organization_id}
              </dd>
            </div>
          </dl>
        ) : null}
        {isAdmin && onboardingDone ? (
          <form
            className={settings.settingsForm}
            style={{ marginTop: "1.25rem", maxWidth: "28rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              setEditMessage(null);
              const payload: { organization_name?: string; organization_slug?: string } = {};
              if (editName.trim() !== org?.name) {
                payload.organization_name = editName.trim();
              }
              if (editSlug.trim() !== org?.slug) {
                payload.organization_slug = editSlug.trim();
              }
              if (!payload.organization_name && !payload.organization_slug) {
                setEditMessage("No changes to save.");
                return;
              }
              updateOrg.mutate(payload);
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", margin: "0 0 0.75rem" }}>Rename organization</h3>
            <p className={ui.muted} style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
              Display name can change anytime. Changing the URL slug updates API paths and rebinds
              agent DIDs (<span className="mono">did:salanor:…</span>) — coordinate with your team
              before saving.
            </p>
            <label>
              <span className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Company name
              </span>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label>
              <span className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Organization URL
              </span>
              <input
                className="input mono"
                value={editSlug}
                onChange={(e) => {
                  setEditSlugTouched(true);
                  setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                minLength={2}
                maxLength={48}
                pattern="[a-z0-9][a-z0-9-]*"
                required
              />
            </label>
            {editMessage ? (
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: updateOrg.isError ? "var(--console-danger, #b91c1c)" : undefined,
                }}
              >
                {editMessage}
              </p>
            ) : null}
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={updateOrg.isPending}
            >
              {updateOrg.isPending ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : null}
      </section>

      <section className={settings.settingCard}>
        <h2>Plan & usage</h2>
        {planQuery.isLoading ? <p className={ui.muted}>Loading plan…</p> : null}
        {usage ? (
          <>
            <p style={{ margin: "0 0 0.75rem" }}>
              <strong>{usage.display_name}</strong>{" "}
              <span className="mono">({usage.plan})</span>
              {!usage.active ? (
                <span style={{ color: "var(--console-danger, #b91c1c)" }}> — suspended</span>
              ) : null}
            </p>
            <p className={ui.muted} style={{ fontSize: "0.8125rem", margin: "0 0 0.5rem" }}>
              Events this month: {eventUsed}
              {eventCap != null ? ` / ${eventCap}` : " (unlimited)"}
            </p>
            {eventPct != null ? (
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--console-border, #e2e8f0)",
                  marginBottom: "0.75rem",
                  maxWidth: "20rem",
                }}
              >
                <div
                  style={{
                    width: `${eventPct}%`,
                    height: "100%",
                    borderRadius: 3,
                    background:
                      eventPct >= 90 ? "var(--console-danger, #b91c1c)" : "var(--console-accent, #2563eb)",
                  }}
                />
              </div>
            ) : null}
            <ul className={ui.muted} style={{ fontSize: "0.8125rem", paddingLeft: "1.25rem" }}>
              <li>API keys: up to {usage.limits.max_ingest_keys}</li>
              <li>Members: up to {usage.limits.max_members}</li>
              <li>Retention: {usage.limits.retention_days} days</li>
            </ul>
            {isAdmin &&
            (usage.billing_checkout_enabled ||
              process.env.NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED === "1") ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
                {usage.self_serve ? (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    disabled={checkout.isPending}
                    onClick={() => checkout.mutate("team")}
                  >
                    Upgrade to Team (Stripe)
                  </button>
                ) : null}
                {usage.billing_portal_available ? (
                  <button
                    type="button"
                    className={ui.btn}
                    disabled={portal.isPending}
                    onClick={() => portal.mutate()}
                  >
                    Manage billing (invoices & payment)
                  </button>
                ) : null}
              </div>
            ) : null}
            {!usage.billing_checkout_enabled ? (
              <p className={ui.muted} style={{ marginTop: "0.75rem", fontSize: "0.75rem" }}>
                Self-serve checkout is off. Salanor ops can change your plan in Platform admin.
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {isAdmin ? (
        <section className={settings.settingCard}>
          <h2>Create another organization</h2>
          <p>
            Add a separate org with its own ledger, policies, and API keys. You become
            admin on the new org and can switch between orgs from the header.
          </p>
          <form
            className={settings.settingsForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (newOrgName.trim()) {
                createOrg.mutate(newOrgName.trim());
              }
            }}
          >
            <label className={ui.field}>
              <span>Organization name</span>
              <input
                className={ui.input}
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Acme EU"
                required
              />
            </label>
            {createOrg.isError ? (
              <ErrorAlert message={(createOrg.error as Error).message} />
            ) : null}
            {createOrg.isSuccess ? (
              <p className={ui.muted}>Organization created. Switched to the new org.</p>
            ) : null}
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={createOrg.isPending}
            >
              {createOrg.isPending ? "Creating…" : "Create organization"}
            </button>
          </form>
        </section>
      ) : null}

      <section className={settings.settingCard}>
        <h2>Ledger & region</h2>
        <p>
          APS-1 ledger isolation is enforced per organization. Region and BYOC topology are
          configured by Salanor during onboarding.
        </p>
        <p className={ui.muted} style={{ margin: 0, fontSize: "0.8125rem" }}>
          {isAdmin
            ? "Manage teammates in Members, ingest credentials in API keys, and tool rules in Policies."
            : "Ask an organization admin to change organization settings or invite teammates."}
        </p>
      </section>
    </>
  );
}
