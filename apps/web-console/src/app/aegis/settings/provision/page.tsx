"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { ErrorAlert, ui } from "@/components/console/console-ui";

const PLATFORM_OPS = process.env.NEXT_PUBLIC_PLATFORM_OPS === "1";

type ProvisionResult = {
  organization_id: string;
  admin_email: string;
  membership_id: string;
  message: string;
};

export default function ProvisionOrgPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const provision = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/platform/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          admin_email: adminEmail.trim(),
          admin_password: adminPassword || undefined,
          plan,
        }),
      });
      const data = (await response.json()) as ProvisionResult & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Provisioning failed");
      }
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setName("");
      setSlug("");
      setAdminEmail("");
      setAdminPassword("");
    },
  });

  if (!PLATFORM_OPS) {
    return (
      <EmptyStatePanel
          icon={Building2}
          title="Platform ops disabled"
          description={
            <>
              Set <code className="mono">NEXT_PUBLIC_PLATFORM_OPS=1</code> and{" "}
              <code className="mono">PLATFORM_BOOTSTRAP_SECRET</code> in{" "}
              <code className="mono">.env</code> to create customer organizations from
              the console. Until then, use <code className="mono">pnpm db:seed</code>{" "}
              or the ID API directly.
            </>
          }
        />
    );
  }

  return (
    <>
      <section className={ui.panel}>
        <form
          className={ui.formGrid}
          style={{ maxWidth: "28rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            provision.mutate();
          }}
        >
          <label className={ui.field}>
            Organization name
            <input
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </label>
          <label className={ui.field}>
            Slug
            <input
              className={ui.input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              required
            />
          </label>
          <label className={ui.field}>
            Plan
            <select
              className={ui.input}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
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
              placeholder="admin@acme.com"
              required
            />
          </label>
          <label className={ui.field}>
            Admin password (optional)
            <input
              className={ui.input}
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Set initial password (hashed with scrypt)"
            />
          </label>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={provision.isPending}
          >
            {provision.isPending ? "Creating…" : "Create organization"}
          </button>
        </form>
        {provision.isError ? (
          <ErrorAlert message={(provision.error as Error).message} />
        ) : null}
      </section>

      {result ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`}>
          <strong>Organization created</strong>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>{result.message}</p>
          <pre className={ui.pre} style={{ marginTop: "0.75rem" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}
    </>
  );
}
