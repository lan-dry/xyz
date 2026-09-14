"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { platformApi } from "@/lib/platform-api";

const PLATFORM_OPS = process.env.NEXT_PUBLIC_PLATFORM_OPS === "1";

type OrgRow = {
  organization_id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  created_at: string;
  member_count: number;
  events_this_month: number;
};

type AccountRow = {
  account_id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  memberships: Array<{
    membership_id: string;
    organization_id: string;
    org_name: string;
    role: string;
    status: string;
  }>;
};

type PlanRow = {
  plan_slug: string;
  display_name: string;
  events_per_month: number | null;
  max_ingest_keys: number;
  max_members: number;
  self_serve: boolean;
  stripe_price_id: string | null;
};

function OpsGate() {
  return (
    <ConsolePage>
      <PageHeader title="Platform admin" subtitle="Salanor ops only." />
      <p className={ui.muted}>
        Set <code className="mono">NEXT_PUBLIC_PLATFORM_OPS=1</code> and{" "}
        <code className="mono">PLATFORM_BOOTSTRAP_SECRET</code> in <code className="mono">.env</code>.
      </p>
    </ConsolePage>
  );
}

export default function PlatformAdminPage() {
  const [tab, setTab] = useState<"orgs" | "users" | "plans" | "leads">("orgs");
  const [orgQuery, setOrgQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ["platform", "orgs", orgQuery],
    queryFn: () =>
      platformApi<{ organizations: OrgRow[] }>(
        `organizations?q=${encodeURIComponent(orgQuery)}`,
      ),
    enabled: PLATFORM_OPS && tab === "orgs",
  });

  const usersQuery = useQuery({
    queryKey: ["platform", "users", userQuery],
    queryFn: () =>
      platformApi<{ accounts: AccountRow[] }>(
        `accounts?q=${encodeURIComponent(userQuery)}`,
      ),
    enabled: PLATFORM_OPS && tab === "users",
  });

  const plansQuery = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi<{ plans: PlanRow[] }>("plan-catalog"),
    enabled: PLATFORM_OPS && tab === "plans",
  });

  const leadsQuery = useQuery({
    queryKey: ["platform", "leads"],
    queryFn: () =>
      platformApi<{ messages: Record<string, unknown>[]; path: string }>("contact-leads"),
    enabled: PLATFORM_OPS && tab === "leads",
  });

  const patchOrg = useMutation({
    mutationFn: (input: { id: string; plan?: string; active?: boolean }) =>
      platformApi(`/organizations/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ plan: input.plan, active: input.active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "orgs"] });
    },
  });

  const patchAccount = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      platformApi(`/accounts/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: input.active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (input: { id: string; password: string }) =>
      platformApi(`/accounts/${encodeURIComponent(input.id)}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: input.password }),
      }),
  });

  const patchPlan = useMutation({
    mutationFn: (input: { slug: string; patch: Partial<PlanRow> }) =>
      platformApi(`/plan-catalog/${encodeURIComponent(input.slug)}`, {
        method: "PATCH",
        body: JSON.stringify(input.patch),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "plans"] });
    },
  });

  if (!PLATFORM_OPS) return <OpsGate />;

  return (
    <ConsolePage>
      <PageHeader
        title="Platform admin"
        subtitle="Manage all customer orgs, accounts, plan limits, and marketing leads."
        actions={
          <Link href="/aegis/settings/provision" className={`${ui.btn} ${ui.btnSecondary}`}>
            Provision org
          </Link>
        }
      />

      <div className={ui.formRow} style={{ marginBottom: "1rem" }}>
        {(["orgs", "users", "plans", "leads"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={t === tab ? `${ui.btn} ${ui.btnPrimary}` : `${ui.btn} ${ui.btnSecondary}`}
            onClick={() => setTab(t)}
          >
            {t === "orgs"
              ? "Organizations"
              : t === "users"
                ? "Users"
                : t === "plans"
                  ? "Plans"
                  : "Leads"}
          </button>
        ))}
      </div>

      {tab === "orgs" ? (
        <>
          <input
            className={ui.input}
            placeholder="Search orgs…"
            value={orgQuery}
            onChange={(e) => setOrgQuery(e.target.value)}
            style={{ maxWidth: "20rem", marginBottom: "1rem" }}
          />
          {orgsQuery.isLoading ? <LoadingBlock /> : null}
          {orgsQuery.error ? <ErrorAlert message="Failed to load organizations." /> : null}
          {(orgsQuery.data?.organizations ?? []).map((o) => (
            <div key={o.organization_id} className={ui.listCard} style={{ marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {o.name}{" "}
                <span className={ui.muted} style={{ fontWeight: 400 }}>
                  ({o.slug})
                </span>
              </p>
              <p className={ui.muted} style={{ margin: "0.25rem 0", fontSize: "0.8125rem" }}>
                {o.member_count} members · {o.events_this_month} events this month ·{" "}
                {o.active ? "active" : "suspended"}
              </p>
              <div className={ui.formRow}>
                <select
                  className={ui.input}
                  defaultValue={o.plan}
                  onChange={(e) =>
                    patchOrg.mutate({ id: o.organization_id, plan: e.target.value })
                  }
                >
                  <option value="free">free</option>
                  <option value="team">team</option>
                  <option value="enterprise">enterprise</option>
                </select>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() =>
                    patchOrg.mutate({ id: o.organization_id, active: !o.active })
                  }
                >
                  {o.active ? "Suspend org" : "Activate org"}
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {tab === "users" ? (
        <>
          <input
            className={ui.input}
            placeholder="Search by email…"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            style={{ maxWidth: "20rem", marginBottom: "1rem" }}
          />
          {usersQuery.isLoading ? <LoadingBlock /> : null}
          {(usersQuery.data?.accounts ?? []).map((a) => (
            <div key={a.account_id} className={ui.listCard} style={{ marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{a.email}</p>
              <p className={ui.muted} style={{ fontSize: "0.8125rem" }}>
                {a.memberships.map((m) => `${m.org_name} (${m.role})`).join(" · ") || "No memberships"}
              </p>
              <div className={ui.formRow}>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() => patchAccount.mutate({ id: a.account_id, active: !a.active })}
                >
                  {a.active ? "Suspend account" : "Activate account"}
                </button>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() => {
                    const password = window.prompt("New password (min 8 chars):");
                    if (password && password.length >= 8) {
                      resetPassword.mutate({ id: a.account_id, password });
                    }
                  }}
                >
                  Reset password
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {tab === "plans" ? (
        <>
          {plansQuery.isLoading ? <LoadingBlock /> : null}
          {(plansQuery.data?.plans ?? []).map((p) => (
            <div key={p.plan_slug} className={ui.listCard} style={{ marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {p.display_name} <span className="mono">({p.plan_slug})</span>
              </p>
              <p className={ui.muted} style={{ fontSize: "0.8125rem" }}>
                Events/mo: {p.events_per_month ?? "∞"} · Keys: {p.max_ingest_keys} · Members:{" "}
                {p.max_members} · Self-serve: {p.self_serve ? "yes" : "no"}
              </p>
              <label className={ui.field}>
                Stripe price ID
                <input
                  className={ui.input}
                  defaultValue={p.stripe_price_id ?? ""}
                  onBlur={(e) =>
                    patchPlan.mutate({
                      slug: p.plan_slug,
                      patch: { stripe_price_id: e.target.value || null },
                    })
                  }
                />
              </label>
            </div>
          ))}
        </>
      ) : null}

      {tab === "leads" ? (
        <>
          <p className={ui.muted} style={{ fontSize: "0.8125rem" }}>
            Source: {leadsQuery.data?.path ?? "messages.jsonl"}
          </p>
          {leadsQuery.isLoading ? <LoadingBlock /> : null}
          {(leadsQuery.data?.messages ?? []).map((m, i) => (
            <div key={i} className={ui.listCard} style={{ marginBottom: "0.5rem" }}>
              <pre style={{ margin: 0, fontSize: "0.75rem", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(m, null, 2)}
              </pre>
            </div>
          ))}
        </>
      ) : null}
    </ConsolePage>
  );
}
