"use client";

import { CreditCard } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";
import { EmptyStatePanel, ErrorAlert, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

type PlanRow = {
  plan_slug: string;
  display_name: string;
  events_per_month: number | null;
  max_ingest_keys: number;
  max_members: number;
  self_serve: boolean;
  stripe_price_id: string | null;
};

function PlanEditorCard({
  plan,
  onSaved,
  readOnly,
}: {
  plan: PlanRow;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState({
    events_per_month: plan.events_per_month === null ? "" : String(plan.events_per_month),
    max_ingest_keys: String(plan.max_ingest_keys),
    max_members: String(plan.max_members),
    self_serve: plan.self_serve,
    stripe_price_id: plan.stripe_price_id ?? "",
  });
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      platformApi(`/plan-catalog/${encodeURIComponent(plan.plan_slug)}`, {
        method: "PATCH",
        body: JSON.stringify({
          events_per_month:
            draft.events_per_month.trim() === "" ? null : Number(draft.events_per_month),
          max_ingest_keys: Number(draft.max_ingest_keys),
          max_members: Number(draft.max_members),
          self_serve: draft.self_serve,
          stripe_price_id: draft.stripe_price_id.trim() || null,
        }),
      }),
    onSuccess: () => {
      setSaved(true);
      onSaved();
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <section className={card.settingCard}>
      <h2>
        {plan.display_name}{" "}
        <span
          style={{
            fontWeight: 500,
            fontSize: "0.8125rem",
            color: "var(--console-fg-muted)",
          }}
        >
          ({plan.plan_slug})
        </span>
      </h2>
      <div
        className={ui.twoCol}
        style={{ maxWidth: "42rem", gap: "1rem", marginBottom: "1rem" }}
      >
        <label className={ui.field}>
          Events / month
          <input
            className={ui.input}
            value={draft.events_per_month}
            placeholder="∞"
            onChange={(e) => setDraft((d) => ({ ...d, events_per_month: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={ui.field}>
          Max ingest keys
          <input
            className={ui.input}
            type="number"
            min={0}
            value={draft.max_ingest_keys}
            onChange={(e) => setDraft((d) => ({ ...d, max_ingest_keys: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={ui.field}>
          Max members
          <input
            className={ui.input}
            type="number"
            min={0}
            value={draft.max_members}
            onChange={(e) => setDraft((d) => ({ ...d, max_members: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={ui.field}>
          Self-serve checkout
          <select
            className={ui.select}
            value={draft.self_serve ? "yes" : "no"}
            onChange={(e) => setDraft((d) => ({ ...d, self_serve: e.target.value === "yes" }))}
            disabled={readOnly}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
      </div>
      <label className={ui.field} style={{ maxWidth: "24rem", display: "block" }}>
        Stripe price ID
        <input
          className={ui.input}
          value={draft.stripe_price_id}
          placeholder="price_…"
          onChange={(e) => setDraft((d) => ({ ...d, stripe_price_id: e.target.value }))}
          disabled={readOnly}
        />
      </label>
      {!readOnly ? (
        <div className={ui.formRow} style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : saved ? "Saved" : "Save changes"}
          </button>
        </div>
      ) : null}
      {save.isError ? <ErrorAlert message={(save.error as Error).message} /> : null}
    </section>
  );
}

export default function PlansPage() {
  const { email, logout, can } = usePlatformSession();
  const canEditPlans = can("platform:plans.write");
  const queryClient = useQueryClient();

  const plansQuery = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: () => platformApi<{ plans: PlanRow[] }>("plan-catalog"),
  });

  const plans = plansQuery.data?.plans ?? [];

  return (
    <OpsShell
      title="Plan catalog"
      subtitle="Limits enforced on ingest, API keys, and members."
      staffEmail={email}
      onLogout={logout}
    >
      {plansQuery.isLoading ? (
        <p className={ui.loading}>Loading plans…</p>
      ) : plans.length === 0 ? (
        <EmptyStatePanel
          icon={CreditCard}
          title="No plans in catalog"
          description="Run database migrations to seed plan_catalog."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {plans.map((p) => (
            <PlanEditorCard
              key={p.plan_slug}
              plan={p}
              readOnly={!canEditPlans}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ["platform", "plans"] });
              }}
            />
          ))}
        </div>
      )}
    </OpsShell>
  );
}
