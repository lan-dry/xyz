"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

type Tenant = {
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  member_count: number;
  last_demo_reset_at: string | null;
};

type AuditRow = {
  wipe_id: string;
  wiped_at: string;
  tenant_slug: string;
  tenant_name: string | null;
  actor: string;
  action: string;
  result: Record<string, unknown>;
};

type ActionKind = "populate" | "reset" | "wipe";

/** Known disposable orgs; shown even when none exist yet. */
const KNOWN_SLUGS = [
  { slug: "demo-bank", label: "Demo Bank" },
  { slug: "redteam-lab", label: "Red Team Lab" },
] as const;

function fmt(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function DemoTenantsPage() {
  const { email, logout, can } = usePlatformSession();
  const canWrite = can("platform:orgs.write");
  const canProvision = can("platform:provision");
  const qc = useQueryClient();

  const [slug, setSlug] = useState("demo-bank");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tenantsQ = useQuery({
    queryKey: ["demo-tenants"],
    queryFn: () => platformApi<{ tenants: Tenant[] }>("demo-tenants"),
  });
  const auditQ = useQuery({
    queryKey: ["demo-tenants-audit"],
    queryFn: () => platformApi<{ audit: AuditRow[] }>("demo-tenants/audit"),
  });

  const run = useMutation({
    mutationFn: async (action: ActionKind) => {
      setError(null);
      setMessage(null);
      const path =
        action === "populate"
          ? "demo-tenants/populate"
          : action === "wipe"
            ? "demo-tenants/wipe"
            : "demo-tenants/reset";
      return platformApi<{
        ok: boolean;
        action?: string;
        warning?: string;
        detail?: string;
      }>(path, {
        method: "POST",
        body: JSON.stringify({
          slug,
          confirm_slug: confirm,
          name: slug === "demo-bank" ? "Demo Bank" : slug === "redteam-lab" ? "Red Team Lab" : slug,
        }),
      });
    },
    onSuccess: (data, action) => {
      const label =
        action === "populate"
          ? "Populated"
          : action === "reset"
            ? "Reset to fresh demo"
            : "Deleted";
      const detail = data?.detail?.trim();
      const shortDetail =
        detail && detail.length > 280 ? `${detail.slice(-280)}` : detail;
      setMessage(
        [
          `${label} ${slug}`,
          data?.warning,
          shortDetail,
        ]
          .filter(Boolean)
          .join(": "),
      );
      setConfirm("");
      void qc.invalidateQueries({ queryKey: ["demo-tenants"] });
      void qc.invalidateQueries({ queryKey: ["demo-tenants-audit"] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const hasWrite = canWrite || canProvision;

  return (
    <OpsShell
      title="Demo data"
      subtitle="Populate full demo (org, users, pack, history). Reset restores that state. Delete leaves only your Ops superadmin and salanor-platform."
      staffEmail={email}
      onLogout={logout}
    >
      <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: 24 }}>
        <h2 className={ui.cardTitle}>Current demo orgs</h2>
        {tenantsQ.isLoading ? (
          <p className={ui.cardHint}>Loading…</p>
        ) : tenantsQ.isError ? (
          <div className={`${ui.alert} ${ui.alertError}`}>{String(tenantsQ.error)}</div>
        ) : !tenantsQ.data?.tenants.length ? (
          <EmptyStatePanel
            title="No demo data"
            description="Nothing populated yet. Pick a slug below, then Populate."
          />
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Last reset</th>
                </tr>
              </thead>
              <tbody>
                {tenantsQ.data.tenants.map((t) => (
                  <tr key={t.organization_id}>
                    <td>
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        style={{ padding: "0.2rem 0.5rem", fontSize: 13 }}
                        onClick={() => {
                          setSlug(t.slug);
                          setConfirm("");
                        }}
                      >
                        {t.slug}
                      </button>
                    </td>
                    <td>{t.name}</td>
                    <td>{t.status}</td>
                    <td>{t.member_count}</td>
                    <td>{fmt(t.last_demo_reset_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: 24 }}>
        <h2 className={ui.cardTitle}>Actions</h2>
        <p className={ui.cardHint}>
          Type the slug twice. Customer orgs cannot be deleted here.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
            marginBottom: 4,
          }}
        >
          {KNOWN_SLUGS.map((k) => {
            const live = tenantsQ.data?.tenants?.some((t) => t.slug === k.slug);
            return (
              <button
                key={k.slug}
                type="button"
                className={`${ui.btn} ${slug === k.slug ? ui.btnPrimary : ui.btnSecondary}`}
                onClick={() => {
                  setSlug(k.slug);
                  setConfirm("");
                }}
                title={live ? "Currently populated" : "Not populated. Use Populate."}
              >
                {k.slug}
                {live ? " · live" : ""}
              </button>
            );
          })}
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            maxWidth: 560,
            marginTop: 12,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "1fr",
            }}
            className="demo-slug-row"
          >
            <label>
              Slug
              <input
                className={ui.input}
                value={slug}
                onChange={(e) => setSlug(e.target.value.trim())}
                autoComplete="off"
              />
            </label>
            <label>
              Confirm slug
              <input
                className={ui.input}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.trim())}
                autoComplete="off"
                placeholder="re-type slug"
              />
            </label>
          </div>
          <style>{`
            @media (min-width: 640px) {
              .demo-slug-row {
                grid-template-columns: 1fr 1fr !important;
              }
            }
          `}</style>
          {hasWrite ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {canProvision ? (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  disabled={run.isPending || !confirm}
                  onClick={() => run.mutate("populate")}
                >
                  Populate full demo
                </button>
              ) : null}
              {canWrite ? (
                <>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    disabled={run.isPending || !confirm}
                    onClick={() => run.mutate("reset")}
                  >
                    Reset to fresh demo
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    disabled={run.isPending || !confirm}
                    onClick={() => {
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm(
                          `Delete ${slug}? Removes that org and its users/data. Ops superadmin stays.`,
                        )
                      ) {
                        return;
                      }
                      run.mutate("wipe");
                    }}
                  >
                    Delete demo
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <p className={ui.cardHint}>Staff role is read-only.</p>
          )}
          {run.isPending ? (
            <p className={ui.cardHint}>Working… this can take a few minutes.</p>
          ) : null}
          {message ? (
            <div className={`${ui.alert} ${ui.alertSuccess}`}>{message}</div>
          ) : null}
          {error ? (
            <div className={`${ui.alert} ${ui.alertError}`}>{error}</div>
          ) : null}
        </div>
      </section>

      <section className={`${ui.card} ${ui.cardPad}`}>
        <h2 className={ui.cardTitle}>Audit</h2>
        {auditQ.isLoading ? (
          <p className={ui.cardHint}>Loading…</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Tenant</th>
                  <th>Actor</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {(auditQ.data?.audit ?? []).map((a) => (
                  <tr key={a.wipe_id}>
                    <td>{fmt(a.wiped_at)}</td>
                    <td>{a.action}</td>
                    <td>{a.tenant_slug}</td>
                    <td>{a.actor}</td>
                    <td>
                      <code style={{ fontSize: 12 }}>
                        {JSON.stringify(a.result ?? {}).slice(0, 120)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </OpsShell>
  );
}
