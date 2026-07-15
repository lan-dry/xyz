"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";

import styles from "./provision.module.css";
import { ErrorAlert, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";
import { slugFromOrganizationName } from "@/lib/slug-from-name";

type ProvisionResult = {
  message: string;
  sdk_config: Record<string, unknown>;
};

export default function ProvisionPage() {
  const { email, logout, can } = usePlatformSession();
  const canProvision = can("platform:provision");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [plan, setPlan] = useState("free");
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const slugTouched = useRef(false);

  const plansQuery = useQuery({
    queryKey: ["platform", "plan-catalog"],
    queryFn: () =>
      platformApi<{ plans: Array<{ plan_slug: string; display_name: string }> }>(
        "plan-catalog",
      ),
  });

  const provision = useMutation({
    mutationFn: () =>
      platformApi<ProvisionResult>("organizations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          admin_email: adminEmail.trim(),
          admin_password: adminPassword || undefined,
          plan,
        }),
      }),
    onSuccess: (data) => {
      setResult(data);
      setName("");
      setSlug("");
      slugTouched.current = false;
      setAdminEmail("");
      setAdminPassword("");
    },
  });

  return (
    <OpsShell
      title="Provision organization"
      subtitle="Create a customer org, first admin, and default signing agent."
      staffEmail={email}
      onLogout={logout}
    >
      <section className={card.settingCard}>
        <h2>New organization</h2>
        {!canProvision ? (
          <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
            Your platform role is read-only. Ask a platform admin or super admin to provision
            organizations.
          </p>
        ) : (
          <p>Creates the org, admin membership, and default ingest agent. Copy the signing key once shown.</p>
        )}
        <div className={styles.formWrap}>
        <form
          className={ui.formGrid}
          onSubmit={(e) => {
            e.preventDefault();
            if (canProvision) provision.mutate();
          }}
        >
          <label className={ui.field}>
            Organization name
            <input
              className={ui.input}
              value={name}
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                if (!slugTouched.current) setSlug(slugFromOrganizationName(next));
              }}
              required
              disabled={!canProvision}
            />
          </label>
          <label className={ui.field}>
            Slug
            <input
              className={ui.input}
              value={slug}
              onChange={(e) => {
                slugTouched.current = true;
                setSlug(e.target.value);
              }}
              required
              disabled={!canProvision}
            />
          </label>
          <label className={ui.field}>
            Plan
            <select
              className={ui.select}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              disabled={!canProvision}
            >
              {(plansQuery.data?.plans ?? [{ plan_slug: "free", display_name: "Free" }]).map(
                (p) => (
                  <option key={p.plan_slug} value={p.plan_slug}>
                    {p.display_name}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className={ui.field}>
            Admin email
            <input
              className={ui.input}
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
              disabled={!canProvision}
            />
          </label>
          <label className={ui.field}>
            Admin password (optional)
            <input
              className={ui.input}
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              disabled={!canProvision}
            />
          </label>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={!canProvision || provision.isPending}
          >
            {provision.isPending ? "Creating…" : "Create organization"}
          </button>
        </form>
        {provision.isError ? (
          <ErrorAlert message={(provision.error as Error).message} />
        ) : null}
        </div>
      </section>

      {result ? (
        <section className={card.settingCard}>
          <h2>Created</h2>
          <p>{result.message}</p>
          <pre className={ui.pre}>{JSON.stringify(result.sdk_config, null, 2)}</pre>
        </section>
      ) : null}
    </OpsShell>
  );
}
