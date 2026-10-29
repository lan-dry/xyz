"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { IdApiError, idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

import settings from "../settings.module.css";

type Residency = {
  region: string;
  topology: string;
  legal_hold: boolean;
  retention_days: number | null;
  note: string;
};

function ResidencyLegalHold({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const residencyQuery = useQuery({
    queryKey: ["console", "organization-residency"],
    queryFn: () => consoleApi<{ residency: Residency }>("/organization/residency"),
  });
  const holdMutation = useMutation({
    mutationFn: (legal_hold: boolean) =>
      consoleApi<{ legal_hold: boolean }>("/organization/legal-hold", {
        method: "PATCH",
        body: JSON.stringify({ legal_hold }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "organization-residency"] });
    },
  });
  const residency = residencyQuery.data?.residency;
  return (
    <>
      {residencyQuery.isLoading ? (
        <p className={ui.muted}>Loading residency…</p>
      ) : null}
      {residencyQuery.isError ? (
        <ErrorAlert message={(residencyQuery.error as Error).message} />
      ) : null}
      {residency ? (
        <dl className={ui.formGrid} style={{ gap: "0.75rem", marginBottom: "1rem" }}>
          <div>
            <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
              Region
            </dt>
            <dd style={{ margin: "0.25rem 0 0" }} className="mono">
              {residency.region}
            </dd>
          </div>
          <div>
            <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
              Topology
            </dt>
            <dd style={{ margin: "0.25rem 0 0" }} className="mono">
              {residency.topology}
            </dd>
          </div>
          <div>
            <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
              Retention
            </dt>
            <dd style={{ margin: "0.25rem 0 0" }}>
              {residency.retention_days != null
                ? `${residency.retention_days} days`
                : "Unlimited"}
            </dd>
          </div>
          <div>
            <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
              Legal hold
            </dt>
            <dd style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>
              {residency.legal_hold ? "On (purge frozen)" : "Off"}
            </dd>
          </div>
        </dl>
      ) : null}
      <p className={ui.muted} style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem" }}>
        {residency?.note ??
          "Legal hold freezes retention purge for this organization. Region is set at onboarding."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        {isAdmin ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={holdMutation.isPending || !residency}
            onClick={() => holdMutation.mutate(!residency?.legal_hold)}
          >
            {holdMutation.isPending
              ? "Updating…"
              : residency?.legal_hold
                ? "Release legal hold"
                : "Enable legal hold"}
          </button>
        ) : null}
        <Link href="/aegis/settings/members" className={ui.tableLink}>
          Manage members and Approver roles
        </Link>
      </div>
      {holdMutation.isError ? (
        <ErrorAlert message={(holdMutation.error as Error).message} />
      ) : null}
    </>
  );
}

type PlanUsage = {
  plan: string;
  display_name: string;
  active: boolean;
  usage: { events_this_month: number; ingest_keys?: number; members?: number };
  limits: {
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
  };
};

export default function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const [newOrgName, setNewOrgName] = useState("");
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [, setEditSlugTouched] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const planQuery = useQuery({
    queryKey: ["console", "plan-usage"],
    queryFn: () => consoleApi<{ plan_usage: PlanUsage }>("/organization/plan-usage"),
  });

  const updateOrg = useMutation({
    mutationFn: async (input: { organization_name?: string; organization_slug?: string }) => {
      const orgId = meQuery.data?.organization?.organization_id;
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
  const role = meQuery.data?.user?.role;
  const isAdmin = role === "admin" || role === "owner";
  const onboardingDone = org && !org.needs_onboarding;

  useEffect(() => {
    if (org) {
      setEditName(org.name);
      setEditSlug(org.slug);
      setEditSlugTouched(false);
      setEditMessage(null);
    }
  }, [org?.organization_id]);

  return (
    <div className={settings.settingsStack}>
      <div className={settings.settingsSectionGrid}>
        <section className={settings.settingCard}>
          <h2>Organization</h2>
          <p>Your active organization scope for Aegis data, policies, and exports.</p>
          {org ? (
            <dl className={ui.formGrid} style={{ gap: "0.75rem" }}>
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
              style={{ marginTop: "1.25rem", maxWidth: "none" }}
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
              <div className={settings.formFields}>
                <label className={ui.field}>
                  Company name
                  <input
                    className={ui.input}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label className={ui.field}>
                  Organization slug
                  <input
                    className={`${ui.input} mono`}
                    value={editSlug}
                    onChange={(e) => {
                      setEditSlugTouched(true);
                      setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    minLength={2}
                    maxLength={48}
                    pattern="[a-z0-9][a-z0-9-]*"
                    required
                    placeholder="acme"
                  />
                </label>
              </div>
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
              <div className={settings.formActions}>
                <button
                  type="submit"
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  disabled={updateOrg.isPending}
                >
                  {updateOrg.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className={settings.settingCard}>
          <h2>Legal hold &amp; residency</h2>
          <p>
            Freeze retention purge for audits or litigation. Region and topology are set at
            onboarding.
          </p>
          <ResidencyLegalHold isAdmin={Boolean(isAdmin)} />
        </section>
      </div>

      <div className={settings.settingsSectionGrid}>
        <section className={settings.settingCard}>
          <h2>Plan</h2>
          {usage ? (
            <p style={{ margin: "0 0 0.75rem" }}>
              <strong>{usage.display_name}</strong>{" "}
              <span className="mono">({usage.plan})</span>
              {" · "}
              {usage.usage.events_this_month}
              {usage.limits.events_per_month != null
                ? ` / ${usage.limits.events_per_month}`
                : ""}{" "}
              events this month
            </p>
          ) : (
            <p className={ui.muted}>Loading plan…</p>
          )}
          <p style={{ margin: 0 }}>
            <Link href="/aegis/settings/billing">Manage plan, usage and billing</Link>
          </p>
        </section>

        <section className={settings.settingCard}>
          <h2>People</h2>
          <p>
            Invite teammates and assign Owner, Admin, Approver, Engineer, Auditor, or Viewer.
            Approvers can decide Ask a person; Auditors are read-only.
          </p>
          <Link href="/aegis/settings/members" className={`${ui.btn} ${ui.btnPrimary}`}>
            Open Members
          </Link>
        </section>
      </div>

      {isAdmin ? (
        <section className={settings.settingCard}>
          <h2>Create another organization</h2>
          <p>
            Add a separate org with its own ledger, policies, and API keys. You become
            admin on the new org and can switch between orgs from the header.
          </p>
          <form
            className={settings.settingsForm}
            style={{ maxWidth: "32rem" }}
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
    </div>
  );
}
