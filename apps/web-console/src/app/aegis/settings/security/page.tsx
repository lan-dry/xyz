"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorAlert, LoadingBlock, ui } from "@/components/console/console-ui";
import { PasswordField } from "@/components/auth/password-field";
import { idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";
import { formatRelativeTime } from "@/lib/relative-time";

import settings from "../settings.module.css";

type OrgSecurity = {
  organization: { id: string; slug: string; name: string };
  sso: {
    available: boolean;
    configured: boolean;
    loginReady: boolean;
    configSource: "organization_sso" | "env_map" | "none";
    database: {
      present: boolean;
      enabled: boolean;
      jitProvision: boolean;
      workosOrganizationIdHint: string | null;
      updatedAt: string | null;
    };
    envMap: { configured: boolean; note: string };
    jitProvision: boolean;
    workosOrganizationIdHint: string | null;
    startUrl: string;
  };
};

type LoginEvent = {
  event_id: string;
  method: string;
  success: boolean;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  location: string | null;
  created_at: string;
};

function methodLabel(method: string): string {
  switch (method) {
    case "password":
      return "Email & password";
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    case "sso":
      return "Enterprise SSO";
    default:
      return method;
  }
}

function EnterpriseSsoPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [workosOrgId, setWorkosOrgId] = useState("");
  const [jitProvision, setJitProvision] = useState(false);
  const [ssoMessage, setSsoMessage] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });
  const orgId = meQuery.data?.organization?.organization_id;

  const securityQuery = useQuery({
    queryKey: ["id", "security", orgId],
    queryFn: () => idApi<OrgSecurity>(`/orgs/${orgId}/security`),
    enabled: Boolean(orgId),
  });

  const saveSso = useMutation({
    mutationFn: (input: {
      enabled: boolean;
      jit_provision?: boolean;
      workos_organization_id?: string;
    }) =>
      idApi<{ ok: boolean; message?: string }>(`/orgs/${orgId}/sso`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      setSsoMessage(data.message ?? "SSO settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["id", "security", orgId] });
    },
    onError: () => setSsoMessage(null),
  });

  const sso = securityQuery.data?.sso;

  useEffect(() => {
    if (sso) {
      setJitProvision(sso.database.jitProvision);
    }
  }, [sso?.database.jitProvision]);

  return (
    <section className={settings.settingCard}>
      <h2>
        <KeyRound size={18} style={{ verticalAlign: "-3px", marginRight: "0.35rem" }} />
        Enterprise SSO (SAML / OIDC)
      </h2>
      <p>
        Sign in through your identity provider (Okta, Entra ID, and others) via WorkOS.
        Status reflects the database row, optional <span className="mono">SSO_WORKOS_ORG_MAP</span>{" "}
        env map, and whether WorkOS credentials are configured on the server.
      </p>
      {securityQuery.isPending ? <LoadingBlock /> : null}
      {securityQuery.isError ? (
        <ErrorAlert message={(securityQuery.error as Error).message} />
      ) : null}
      {sso ? (
        <>
          <dl className={ui.formGrid} style={{ maxWidth: "36rem", gap: "0.75rem", marginTop: "1rem" }}>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                WorkOS on server
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }}>
                {sso.available ? "Configured" : "Not configured"}
              </dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Login ready
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }}>
                {sso.loginReady ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Config source
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }} className="mono">
                {sso.configSource}
              </dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Database row
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }}>
                {sso.database.present
                  ? sso.database.enabled
                    ? "Enabled"
                    : "Present, disabled"
                  : "Not set"}
                {sso.database.workosOrganizationIdHint
                  ? ` · ${sso.database.workosOrganizationIdHint}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                Env map
              </dt>
              <dd style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
                {sso.envMap.note}
              </dd>
            </div>
            <div>
              <dt className={ui.muted} style={{ fontSize: "0.75rem" }}>
                JIT provisioning
              </dt>
              <dd style={{ margin: "0.25rem 0 0" }}>
                {sso.jitProvision
                  ? "On (first SSO login creates membership)"
                  : "Off"}
              </dd>
            </div>
          </dl>
          {sso.loginReady ? (
            <p style={{ marginTop: "1rem" }}>
              <a className={`${ui.btn} ${ui.btnSecondary}`} href={sso.startUrl}>
                Test SSO sign-in
              </a>
            </p>
          ) : (
            <p className={ui.muted} style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
              To enable: set WorkOS API credentials on the server, then either add your org slug to{" "}
              <span className="mono">SSO_WORKOS_ORG_MAP</span> or save a WorkOS organization id below.
            </p>
          )}
          {isAdmin ? (
            <form
              className={settings.settingsForm}
              style={{ marginTop: "1.25rem" }}
              onSubmit={(e) => {
                e.preventDefault();
                saveSso.mutate({
                  enabled: true,
                  jit_provision: jitProvision,
                  workos_organization_id: workosOrgId.trim() || undefined,
                });
              }}
            >
              <div className={settings.formFields}>
                <label className={ui.field}>
                  WorkOS organization id
                  <input
                    className={ui.input}
                    placeholder={sso.workosOrganizationIdHint ?? "org_…"}
                    value={workosOrgId}
                    onChange={(e) => setWorkosOrgId(e.target.value)}
                  />
                </label>
                <label className={ui.field} style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={jitProvision}
                    onChange={(e) => setJitProvision(e.target.checked)}
                  />
                  JIT provision new users on first SSO login
                </label>
              </div>
              {saveSso.isError ? (
                <ErrorAlert message={(saveSso.error as Error).message} />
              ) : null}
              {ssoMessage && saveSso.isSuccess ? (
                <p className={ui.muted}>{ssoMessage}</p>
              ) : null}
              <div className={settings.formActions}>
                <button
                  type="submit"
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  disabled={saveSso.isPending || !sso.available}
                >
                  {saveSso.isPending ? "Saving…" : "Enable SSO (database)"}
                </button>
                {sso.database.present && sso.database.enabled ? (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    disabled={saveSso.isPending}
                    onClick={() =>
                      saveSso.mutate({ enabled: false, jit_provision: jitProvision })
                    }
                  >
                    Disable database SSO
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className={ui.muted} style={{ marginTop: "1rem" }}>
              Ask an organization admin to change SSO settings.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

export default function SecuritySettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });
  const role = meQuery.data?.user?.role;
  const isAdmin = role === "admin" || role === "owner";

  const loginEventsQuery = useQuery({
    queryKey: ["id", "login-events"],
    queryFn: () => idApi<{ events: LoginEvent[] }>("/account/login-events"),
  });

  const changePassword = useMutation({
    mutationFn: () => {
      if (next !== confirm) {
        throw new Error("New passwords do not match");
      }
      return idApi<{ ok: boolean }>("/account/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
    },
    onSuccess: () => {
      setMessage("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
      void loginEventsQuery.refetch();
    },
    onError: () => setMessage(null),
  });

  const events = loginEventsQuery.data?.events ?? [];

  return (
    <>
      <EnterpriseSsoPanel isAdmin={isAdmin} />
      <section className={settings.settingCard}>
        <h2>Recent sign-ins</h2>
        <p>
          Sign-in attempts on your Salanor account across organizations. Review unfamiliar IP
          addresses or devices and rotate your password if something looks wrong.
        </p>
        {loginEventsQuery.isPending ? <LoadingBlock /> : null}
        {loginEventsQuery.isError ? (
          <ErrorAlert message={(loginEventsQuery.error as Error).message} />
        ) : null}
        {!loginEventsQuery.isPending && events.length === 0 ? (
          <p className={ui.muted}>No sign-in history recorded yet.</p>
        ) : null}
        {events.length > 0 ? (
          <div className={ui.tableWrap} style={{ marginTop: "1rem" }}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Method</th>
                  <th>Result</th>
                  <th>IP address</th>
                  <th>Location</th>
                  <th>Device</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id}>
                    <td>{formatRelativeTime(e.created_at)}</td>
                    <td>{methodLabel(e.method)}</td>
                    <td>
                      {e.success ? (
                        <span>Success</span>
                      ) : (
                        <span className={ui.tableMuted}>
                          Failed{e.failure_reason ? ` (${e.failure_reason})` : ""}
                        </span>
                      )}
                    </td>
                    <td className="mono">{e.ip_address ?? "-"}</td>
                    <td>{e.location ?? "-"}</td>
                    <td>{e.device ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className={ui.muted} style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
          Location is inferred from IP when you sign in. Cloud, VPN, and mobile carrier IPs
          often show a datacenter city instead of where you are: we label those as
          &quot;Cloud or VPN&quot; instead of a misleading place name.
        </p>
      </section>

      <section className={settings.settingCard}>
        <h2>Password</h2>
        <p>
          Change the password for your Salanor account. Passwords are stored with scrypt hashing.
        </p>
        <form
          className={settings.settingsForm}
          onSubmit={(e) => {
            e.preventDefault();
            changePassword.mutate();
          }}
        >
          <div className={`${settings.formFields} ${settings.formFieldsThree}`}>
            <PasswordField
              label="Current password"
              fieldClassName={ui.field}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
            />
            <PasswordField
              label="New password"
              fieldClassName={ui.field}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm new password"
              fieldClassName={ui.field}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
          </div>
          {changePassword.isError ? (
            <ErrorAlert message={(changePassword.error as Error).message} />
          ) : null}
          {message && changePassword.isSuccess ? (
            <p className={ui.muted}>{message}</p>
          ) : null}
          <div className={settings.formActions}>
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
