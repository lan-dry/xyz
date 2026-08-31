"use client";

import { CreditCard } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planListPrice } from "@salanor/plan-display";

import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";
import { EmptyStatePanel, ErrorAlert, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

import styles from "./plans.module.css";

type PlanRow = {
  plan_slug: string;
  display_name: string;
  events_per_month: number | null;
  max_ingest_keys: number;
  max_members: number;
  retention_days: number;
  self_serve: boolean;
  stripe_price_id: string | null;
  list_price: string;
  list_price_detail: string;
  tagline: string;
  billing_note: string;
  marketing_highlighted: boolean;
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
    list_price: plan.list_price ?? "",
    list_price_detail: plan.list_price_detail ?? "",
    tagline: plan.tagline ?? "",
    billing_note: plan.billing_note ?? "",
    marketing_highlighted: plan.marketing_highlighted ?? false,
    events_per_month: plan.events_per_month === null ? "" : String(plan.events_per_month),
    max_ingest_keys: String(plan.max_ingest_keys),
    max_members: String(plan.max_members),
    retention_days: String(plan.retention_days ?? 90),
    self_serve: plan.self_serve,
    stripe_price_id: plan.stripe_price_id ?? "",
  });
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      platformApi(`/plan-catalog/${encodeURIComponent(plan.plan_slug)}`, {
        method: "PATCH",
        body: JSON.stringify({
          list_price: draft.list_price.trim(),
          list_price_detail: draft.list_price_detail.trim(),
          tagline: draft.tagline.trim(),
          billing_note: draft.billing_note.trim(),
          marketing_highlighted: draft.marketing_highlighted,
          events_per_month:
            draft.events_per_month.trim() === "" ? null : Number(draft.events_per_month),
          max_ingest_keys: Number(draft.max_ingest_keys),
          max_members: Number(draft.max_members),
          retention_days: Number(draft.retention_days),
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

  const listPricePreview = planListPrice(plan.plan_slug, {
    list_price: draft.list_price,
    list_price_detail: draft.list_price_detail,
  });

  return (
    <section className={card.settingCard}>
      <h2 className={styles.heading}>
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
      <div className={styles.fields}>
        <div className={`${ui.field} ${styles.listPriceField}`}>
          <span>Marketing preview</span>
          <output className={styles.listPriceValue}>{listPricePreview ?? "Not configured"}</output>
          <span className={styles.listPriceHint}>
            Shown on www.salanor.com/pricing within ~60 seconds after save
          </span>
        </div>
        <label className={ui.field}>
          List price label
          <input
            className={ui.input}
            value={draft.list_price}
            placeholder="$299"
            onChange={(e) => setDraft((d) => ({ ...d, list_price: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={ui.field}>
          Price detail
          <input
            className={ui.input}
            value={draft.list_price_detail}
            placeholder="/ month"
            onChange={(e) => setDraft((d) => ({ ...d, list_price_detail: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={`${ui.field} ${styles.spanFull}`}>
          Tagline
          <input
            className={ui.input}
            value={draft.tagline}
            onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={`${ui.field} ${styles.spanFull}`}>
          Billing note
          <input
            className={ui.input}
            value={draft.billing_note}
            onChange={(e) => setDraft((d) => ({ ...d, billing_note: e.target.value }))}
            disabled={readOnly}
          />
        </label>
        <label className={ui.field}>
          Highlight on pricing page
          <select
            className={ui.select}
            value={draft.marketing_highlighted ? "yes" : "no"}
            onChange={(e) =>
              setDraft((d) => ({ ...d, marketing_highlighted: e.target.value === "yes" }))
            }
            disabled={readOnly}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
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
          Retention (days)
          <input
            className={ui.input}
            type="number"
            min={1}
            value={draft.retention_days}
            onChange={(e) => setDraft((d) => ({ ...d, retention_days: e.target.value }))}
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
        <label className={`${ui.field} ${styles.spanFull}`}>
          Stripe price ID
          <input
            className={ui.input}
            value={draft.stripe_price_id}
            placeholder="price_…"
            onChange={(e) => setDraft((d) => ({ ...d, stripe_price_id: e.target.value }))}
            disabled={readOnly}
          />
          <span className={styles.listPriceHint}>
            Stripe Dashboard sets what cards are charged; list price above is what prospects see
          </span>
        </label>
      </div>
      {!readOnly ? (
        <div className={`${ui.formRow} ${styles.actions}`}>
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
      subtitle="Single source for www.salanor.com/pricing: list prices, limits, and Stripe Price IDs. Marketing refreshes within ~60s. Update Stripe when you change what cards are charged."
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
