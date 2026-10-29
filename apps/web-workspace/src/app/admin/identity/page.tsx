"use client";

import { Building2, KeyRound, Loader2, Mail } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import { idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/id-types";
import { adminCanWrite } from "@/lib/admin-session";
import { useAdminSession } from "@/hooks/use-admin-session";
import {
  fetchAdminSettings,
  saveAdminSettings,
} from "@/lib/stoa-client";

type OrgSecurity = {
  organization: { id: string; slug: string; name: string };
  sso: {
    available: boolean;
    configured: boolean;
    jitProvision: boolean;
    startUrl: string;
  };
  scim: { enabled: boolean; baseUrl: string; updatedAt: string | null };
};

export default function AdminIdentityPage() {
  const queryClient = useQueryClient();
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSaveMsg, setOrgSaveMsg] = useState<string | null>(null);
  const [emailFromName, setEmailFromName] = useState("");
  const [emailFromAddress, setEmailFromAddress] = useState("");
  const [emailReplyTo, setEmailReplyTo] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [emailSaveMsg, setEmailSaveMsg] = useState<string | null>(null);

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

  useEffect(() => {
    if (securityQuery.data?.organization.name) {
      setOrgName(securityQuery.data.organization.name);
    }
  }, [securityQuery.data?.organization.name]);

  const rotateScim = useMutation({
    mutationFn: () =>
      idApi<{ bearer_token: string; message: string }>(
        `/orgs/${orgId}/scim/rotate-token`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setRevealedToken(data.bearer_token);
      setConfirmRotate(false);
      void queryClient.invalidateQueries({ queryKey: ["id", "security", orgId] });
    },
  });

  const saveOrg = useMutation({
    mutationFn: () =>
      idApi<{ organization: { name: string; slug: string }; message?: string }>(
        `/orgs/${orgId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ organization_name: orgName.trim() }),
        },
      ),
    onSuccess: (data) => {
      setOrgSaveMsg(data.message ?? "Organization updated.");
      void queryClient.invalidateQueries({ queryKey: ["id", "security", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["id", "me"] });
    },
  });

  const stoaSession = useAdminSession();
  const settingsQuery = useQuery({
    queryKey: ["stoa", "admin", "settings"],
    queryFn: fetchAdminSettings,
    staleTime: 30_000,
  });

  useEffect(() => {
    const email = settingsQuery.data?.settings.email;
    if (!email) {
      return;
    }
    setEmailFromName(email.fromName ?? "");
    setEmailFromAddress(email.fromAddress ?? "");
    setEmailReplyTo(email.replyTo ?? "");
    setSmtpHost(email.smtpHost ?? "");
    setSmtpPort(String(email.smtpPort ?? 587));
    setSmtpSecure(email.smtpSecure === true);
    setSmtpUser(email.smtpUser ?? "");
    setSmtpPassword("");
    setSmtpPasswordSet(email.smtpPasswordSet === true);
  }, [settingsQuery.data?.settings.email]);

  const saveEmail = useMutation({
    mutationFn: () => {
      const port = Number(smtpPort);
      const email: Parameters<typeof saveAdminSettings>[0]["email"] = {
        fromName: emailFromName.trim() || null,
        fromAddress: emailFromAddress.trim() || null,
        replyTo: emailReplyTo.trim() || null,
        delivery: "smtp",
        smtpHost: smtpHost.trim() || null,
        smtpPort: Number.isFinite(port) ? port : 587,
        smtpSecure,
        smtpUser: smtpUser.trim() || null,
      };
      if (smtpPassword.trim()) {
        email.smtpPassword = smtpPassword.trim();
      }
      return saveAdminSettings({ email });
    },
    onSuccess: () => {
      setEmailSaveMsg("Email settings saved.");
      setSmtpPassword("");
      void queryClient.invalidateQueries({
        queryKey: ["stoa", "admin", "settings"],
      });
    },
  });

  const canWrite = adminCanWrite(stoaSession.data ?? null);

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Identity</h1>
      </header>

      {!orgId ? (
        <p className={ui.metaMuted}>Loading organization…</p>
      ) : securityQuery.isError ? (
        <div className={ui.alertError}>
          {(securityQuery.error as Error).message}
        </div>
      ) : !securityQuery.data ? (
        <p className={ui.metaMuted}>Loading identity settings…</p>
      ) : (
        <div className={ui.providerGrid}>
          <div className={ui.card}>
            <p className={ui.cardLabel}>
              <Building2 size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
              Organization
            </p>
            <label className={ui.field}>
              Display name
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </label>
            {saveOrg.isError ? (
              <div className={ui.alertError}>{(saveOrg.error as Error).message}</div>
            ) : null}
            {orgSaveMsg ? (
              <div className={ui.alertSuccess}>{orgSaveMsg}</div>
            ) : null}
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!canWrite || saveOrg.isPending || !orgName.trim()}
              onClick={() => saveOrg.mutate()}
            >
              {saveOrg.isPending ? (
                <>
                  <Loader2 className={ui.spinner} aria-hidden />
                  Saving
                </>
              ) : (
                "Save organization"
              )}
            </button>
          </div>

          <div className={ui.card}>
            <p className={ui.cardLabel}>Single sign-on (SSO)</p>
            {securityQuery.data.sso.available ? (
              <>
                <p className={ui.metaMuted}>
                  Status:{" "}
                  <strong>
                    {securityQuery.data.sso.configured
                      ? "Configured"
                      : "Not configured"}
                  </strong>
                  {securityQuery.data.sso.jitProvision
                    ? " · New users are created on first sign-in"
                    : ""}
                </p>
                <a
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  href={securityQuery.data.sso.startUrl}
                >
                  Test sign-in
                </a>
              </>
            ) : (
              <EmptyStatePanel
                icon={KeyRound}
                title="Not enabled"
                description="Staff sign in with your bank's Entra ID or Okta instead of a Workspace password. Contact Salanor to turn this on for your tenant."
              />
            )}
          </div>

          <div className={ui.card} style={{ gridColumn: "1 / -1" }}>
            <p className={ui.cardLabel}>User sync</p>
            <p className={ui.metaMuted} style={{ marginBottom: "0.75rem" }}>
              Let Entra ID or Okta create and deactivate Workspace users automatically
              (SCIM). Separate from SSO, which is how people sign in.
            </p>
            <p className={ui.metaMuted}>
              Sync URL:{" "}
              <span className={ui.mono}>{securityQuery.data.scim.baseUrl}/v2</span>
            </p>
            <p className={ui.metaMuted}>
              Status:{" "}
              <strong>
                {securityQuery.data.scim.enabled ? "Token set" : "Not set up"}
              </strong>
              {securityQuery.data.scim.updatedAt
                ? ` · updated ${new Date(securityQuery.data.scim.updatedAt).toLocaleString()}`
                : null}
            </p>
            {revealedToken ? (
              <div className={ui.alertSuccess}>
                <strong>Copy this token now. It won&apos;t be shown again.</strong>
                <pre className={ui.pre}>{revealedToken}</pre>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() => void navigator.clipboard.writeText(revealedToken)}
                >
                  Copy token
                </button>
              </div>
            ) : null}
            {rotateScim.isError && !confirmRotate ? (
              <div className={ui.alertError}>
                {(rotateScim.error as Error).message}
              </div>
            ) : null}
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!canWrite || rotateScim.isPending}
              onClick={() => {
                if (securityQuery.data?.scim.enabled) {
                  rotateScim.reset();
                  setConfirmRotate(true);
                } else {
                  rotateScim.mutate();
                }
              }}
            >
              {rotateScim.isPending
                ? "Generating…"
                : securityQuery.data.scim.enabled
                  ? "Generate new token"
                  : "Generate token"}
            </button>
            <p className={ui.metaMuted} style={{ marginTop: "1rem" }}>
              Paste this URL and token into your identity provider&apos;s SCIM
              provisioning settings.
            </p>
          </div>

          <div className={ui.card} style={{ gridColumn: "1 / -1" }}>
            <p className={ui.cardLabel}>
              <Mail
                size={14}
                style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
              />
              Email sender
            </p>
            <p className={ui.metaMuted} style={{ marginBottom: "0.85rem" }}>
              Invitation and password emails send through your mail server
              (Microsoft 365, Google Workspace, or any host with SMTP). From
              address stays on your domain.
            </p>

            <label className={ui.field}>
              From name
              <input
                value={emailFromName}
                disabled={!canWrite}
                onChange={(e) => setEmailFromName(e.target.value)}
                placeholder={securityQuery.data.organization.name}
              />
            </label>
            <label className={ui.field}>
              From address
              <input
                type="email"
                value={emailFromAddress}
                disabled={!canWrite}
                onChange={(e) => setEmailFromAddress(e.target.value)}
                placeholder="notifications@yourcompany.com"
              />
            </label>
            <label className={ui.field}>
              Reply-To (optional)
              <input
                type="email"
                value={emailReplyTo}
                disabled={!canWrite}
                onChange={(e) => setEmailReplyTo(e.target.value)}
                placeholder="it-helpdesk@yourcompany.com"
              />
            </label>

            <label className={ui.field}>
              SMTP host
              <input
                value={smtpHost}
                disabled={!canWrite}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.office365.com"
                autoComplete="off"
              />
            </label>
            <div className={ui.policyTwoCol} style={{ marginBottom: "0.75rem" }}>
              <label className={ui.field} style={{ marginBottom: 0 }}>
                Port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={smtpPort}
                  disabled={!canWrite}
                  onChange={(e) => setSmtpPort(e.target.value)}
                />
                <span className={ui.fieldHint}>
                  Usually 587 (STARTTLS) or 465 (SSL).
                </span>
              </label>
              <ul className={ui.checkList} style={{ alignSelf: "end" }}>
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      disabled={!canWrite}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                    />
                    Use SSL (port 465)
                  </label>
                </li>
              </ul>
            </div>
            <label className={ui.field}>
              SMTP username
              <input
                value={smtpUser}
                disabled={!canWrite}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="notifications@yourcompany.com"
                autoComplete="off"
              />
            </label>
            <label className={ui.field}>
              SMTP password
              <input
                type="password"
                value={smtpPassword}
                disabled={!canWrite}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={
                  smtpPasswordSet
                    ? "Saved. Type a new password to replace it."
                    : "App password or mailbox password"
                }
                autoComplete="new-password"
              />
            </label>
            {canWrite && smtpPasswordSet ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                style={{ marginBottom: "0.75rem" }}
                disabled={saveEmail.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Remove the saved SMTP password? Outgoing mail will fail until you set a new one.",
                    )
                  ) {
                    return;
                  }
                  void saveAdminSettings({
                    email: { smtpPassword: null },
                  })
                    .then(() => {
                      setSmtpPasswordSet(false);
                      setEmailSaveMsg("SMTP password removed.");
                      void queryClient.invalidateQueries({
                        queryKey: ["stoa", "admin", "settings"],
                      });
                    })
                    .catch((err: unknown) => {
                      setEmailSaveMsg(null);
                      window.alert(
                        err instanceof Error
                          ? err.message
                          : "Could not remove SMTP password.",
                      );
                    });
                }}
              >
                Remove SMTP password
              </button>
            ) : null}

            {saveEmail.isError ? (
              <div className={ui.alertError}>
                {(saveEmail.error as Error).message}
              </div>
            ) : null}
            {emailSaveMsg ? (
              <div className={ui.alertSuccess}>{emailSaveMsg}</div>
            ) : null}
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!canWrite || saveEmail.isPending}
              onClick={() => saveEmail.mutate()}
            >
              {saveEmail.isPending ? "Saving…" : "Save email settings"}
            </button>
          </div>
        </div>
      )}

      {confirmRotate ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Generate new token</h2>
            <p className={ui.modalDesc}>
              The current token stops working. User sync will stop until you
              enter the new token in your identity provider.
            </p>
            {rotateScim.isError ? (
              <p className={ui.alertError}>{(rotateScim.error as Error).message}</p>
            ) : null}
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setConfirmRotate(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={rotateScim.isPending}
                onClick={() => rotateScim.mutate()}
              >
                {rotateScim.isPending ? "Generating…" : "Generate new token"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
