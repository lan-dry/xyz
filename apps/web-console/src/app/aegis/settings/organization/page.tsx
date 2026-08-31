"use client";

import Link from "next/link";
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
  const isAdmin = meQuery.data?.user?.role === "admin";
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
            style={{ marginTop: "1.25rem" }}
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
              agent DIDs (<span className="mono">did:salanor:…</span>): coordinate with your team
              before saving.
            </p>
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
            <p className={ui.muted} style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
              Short ID used in agent DIDs and internal paths (letters, numbers, hyphens).
              Not a website URL. Use e.g. <span className="mono">acme</span>, not{" "}
              <span className="mono">https://acme.com</span>.
            </p>
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
