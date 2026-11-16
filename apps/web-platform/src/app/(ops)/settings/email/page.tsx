"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import { ErrorAlert, LoadingBlock, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { canPlatform } from "@/lib/platform-permissions";
import { platformApi } from "@/lib/platform-api";

import styles from "./email.module.css";

type EmailSettings = {
  delivery: "platform" | "smtp";
  from_name: string | null;
  from_address: string | null;
  reply_to: string | null;
  key_configured: boolean;
  key_hint: string | null;
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password_configured: boolean;
  env_key_configured: boolean;
  master_key_configured: boolean;
  active_source: "database" | "environment" | "smtp" | "none";
};

type FieldErrors = {
  from_address?: string;
  reply_to?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_password?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function statusCopy(s: EmailSettings): { title: string; detail: string; warn: boolean } {
  if (s.active_source === "smtp") {
    return {
      title: "Using custom SMTP",
      detail: s.smtp_host
        ? `Messages send through ${s.smtp_host}.`
        : "Messages send through your configured mail server.",
      warn: false,
    };
  }
  if (s.active_source === "database") {
    return {
      title: "Using Resend (saved key)",
      detail: s.key_hint
        ? `API key ending in ${s.key_hint} is stored encrypted.`
        : "A Resend API key is stored encrypted.",
      warn: false,
    };
  }
  if (s.active_source === "environment") {
    return {
      title: "Using Resend (environment key)",
      detail: "RESEND_API_KEY is set on the identity service.",
      warn: false,
    };
  }
  return {
    title: "Email not configured",
    detail: "Add SMTP credentials below, or provide a Resend key (saved or in the environment).",
    warn: true,
  };
}

function validateEmailOptional(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
  return undefined;
}

export default function OpsEmailSettingsPage() {
  const { email, logout, platformRole } = usePlatformSession();
  const canWrite = canPlatform(platformRole, "platform:email.write");
  const queryClient = useQueryClient();

  const [fromName, setFromName] = useState<string | null>(null);
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [smtpHost, setSmtpHost] = useState<string | null>(null);
  const [smtpPort, setSmtpPort] = useState<string | null>(null);
  const [smtpSecure, setSmtpSecure] = useState<boolean | null>(null);
  const [smtpUser, setSmtpUser] = useState<string | null>(null);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["platform", "email-settings"],
    queryFn: () => platformApi<{ settings: EmailSettings }>("email-settings"),
  });
  const s = settingsQuery.data?.settings;
  const fromNameValue = fromName ?? s?.from_name ?? "";
  const fromValue = fromAddress ?? s?.from_address ?? "";
  const replyToValue = replyTo ?? s?.reply_to ?? "";
  const smtpHostValue = smtpHost ?? s?.smtp_host ?? "";
  const smtpPortValue = smtpPort ?? String(s?.smtp_port ?? 587);
  const smtpSecureValue = smtpSecure ?? s?.smtp_secure ?? false;
  const smtpUserValue = smtpUser ?? s?.smtp_user ?? "";

  const status = useMemo(() => (s ? statusCopy(s) : null), [s]);

  function validateForSave(): FieldErrors {
    const errors: FieldErrors = {};
    const fromErr = validateEmailOptional(fromValue, "From address");
    if (fromErr) errors.from_address = fromErr;
    // From address is required when actively configuring a sender identity for SMTP/Resend save.
    if (!fromValue.trim()) {
      errors.from_address = "From address is required.";
    }

    const replyErr = validateEmailOptional(replyToValue, "Reply-To address");
    if (replyErr) errors.reply_to = replyErr;

    const portNum = Number(smtpPortValue);
    if (
      smtpPortValue.trim() === "" ||
      !Number.isFinite(portNum) ||
      !Number.isInteger(portNum) ||
      portNum < 1 ||
      portNum > 65535
    ) {
      errors.smtp_port = "Port must be a number between 1 and 65535.";
    }

    const host = smtpHostValue.trim();
    const user = smtpUserValue.trim();
    const anySmtp = Boolean(host || user || smtpPassword.trim());
    if (anySmtp || s?.smtp_password_configured) {
      if (!host) errors.smtp_host = "SMTP host is required when configuring SMTP.";
      if (!user) errors.smtp_user = "SMTP username is required when configuring SMTP.";
      if (!smtpPassword.trim() && !s?.smtp_password_configured) {
        errors.smtp_password = "SMTP password is required for a new SMTP setup.";
      }
    }

    return errors;
  }

  const save = useMutation({
    mutationFn: () => {
      const host = smtpHostValue.trim();
      const user = smtpUserValue.trim();
      const smtpReady =
        Boolean(host) &&
        Boolean(user) &&
        (smtpPassword.trim() !== "" || Boolean(s?.smtp_password_configured));

      return platformApi<{ settings: EmailSettings }>("email-settings", {
        method: "PUT",
        body: JSON.stringify({
          delivery: smtpReady ? "smtp" : "platform",
          from_name: fromNameValue,
          from_address: fromValue.trim(),
          reply_to: replyToValue.trim() || null,
          ...(apiKey.trim() ? { resend_api_key: apiKey.trim() } : {}),
          smtp_host: host || null,
          smtp_port: Number(smtpPortValue) || 587,
          smtp_secure: smtpSecureValue,
          smtp_user: user || null,
          ...(smtpPassword !== "" ? { smtp_password: smtpPassword } : {}),
        }),
      });
    },
    onSuccess: (data) => {
      setApiKey("");
      setSmtpPassword("");
      setFromName(null);
      setFromAddress(null);
      setReplyTo(null);
      setSmtpHost(null);
      setSmtpPort(null);
      setSmtpSecure(null);
      setSmtpUser(null);
      setFieldErrors({});
      setSaved(true);
      setTestMessage(null);
      queryClient.setQueryData(["platform", "email-settings"], data);
    },
    onMutate: () => setSaved(false),
  });

  const clearSecrets = useMutation({
    mutationFn: () =>
      platformApi<{ settings: EmailSettings }>("email-settings", {
        method: "DELETE",
      }),
    onSuccess: (data) => {
      setSaved(false);
      setTestMessage(null);
      queryClient.setQueryData(["platform", "email-settings"], data);
    },
  });

  const sendTest = useMutation({
    mutationFn: () =>
      platformApi<{
        ok: boolean;
        to: string;
        from?: string;
        delivery_mode?: string;
      }>("email-settings/test", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      const fromBit = data.from ? ` from ${data.from}` : "";
      setTestMessage(
        `Test email sent to ${data.to}${fromBit}. Check inbox and spam; subject is “Salanor platform email test”.`,
      );
    },
    onError: () => {
      setTestMessage(null);
    },
  });

  const needsMasterForSecrets = apiKey.trim() !== "" || smtpPassword !== "";

  return (
    <OpsShell
      title="Transactional email"
      subtitle="Invitation, password reset, verification, and approval emails from Salanor."
      staffEmail={email}
      onLogout={logout}
    >
      {settingsQuery.isLoading ? <LoadingBlock /> : null}
      {settingsQuery.error ? (
        <ErrorAlert message={(settingsQuery.error as Error).message} />
      ) : null}

      {s && status ? (
        <form
          className={styles.layout}
          onSubmit={(e) => {
            e.preventDefault();
            if (!canWrite) return;
            const errors = validateForSave();
            setFieldErrors(errors);
            if (Object.keys(errors).length > 0) return;
            save.mutate();
          }}
          noValidate
        >
          <div className={styles.statusCard}>
            <div className={styles.statusMain}>
              <p className={styles.statusLabel}>Current delivery</p>
              <p
                className={`${styles.statusValue} ${status.warn ? styles.statusValueWarn : ""}`}
              >
                {status.title}
              </p>
              <p className={styles.statusMeta}>{status.detail}</p>
            </div>
            {canWrite ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={sendTest.isPending || s.active_source === "none"}
                onClick={() => {
                  setTestMessage(null);
                  sendTest.mutate();
                }}
                title={
                  s.active_source === "none"
                    ? "Configure and save email settings before sending a test"
                    : `Send a test to ${email}`
                }
              >
                {sendTest.isPending ? "Sending…" : "Send test email"}
              </button>
            ) : null}
          </div>

          {testMessage ? (
            <div className={`${ui.alert} ${ui.alertSuccess}`}>{testMessage}</div>
          ) : null}
          {sendTest.isError ? (
            <ErrorAlert message={(sendTest.error as Error).message} />
          ) : null}

          {!s.master_key_configured ? (
            <div className={`${ui.alert} ${ui.alertInfo}`}>
              Set <code className="mono">AEGIS_BRIDGE_MASTER_KEY</code> on the identity service to
              store secrets, or rely on <code className="mono">RESEND_API_KEY</code> in the
              environment.
            </div>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Sender identity</h2>
              <p className={styles.sectionLead}>
                How recipients see the From line on invites and system mail.
              </p>
            </div>
            <div className={styles.stack}>
              <div className={styles.twoCol}>
                <label className={ui.field}>
                  From name
                  <input
                    className={ui.input}
                    value={fromNameValue}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Salanor"
                    autoComplete="off"
                    disabled={!canWrite}
                  />
                  <p className={styles.hint}>Display name next to the From address.</p>
                </label>
                <label className={ui.field}>
                  From address
                  <input
                    className={`${ui.input} ${fieldErrors.from_address ? styles.inputError : ""}`}
                    type="email"
                    value={fromValue}
                    onChange={(e) => {
                      setFromAddress(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, from_address: undefined }));
                    }}
                    placeholder="notifications@salanor.com"
                    autoComplete="off"
                    disabled={!canWrite}
                    required
                  />
                  {fieldErrors.from_address ? (
                    <p className={styles.errorText}>{fieldErrors.from_address}</p>
                  ) : (
                    <p className={styles.hint}>
                      Use an address on a domain you control (example: notifications@salanor.com).
                    </p>
                  )}
                </label>
              </div>
              <label className={ui.field}>
                Reply-To (optional)
                <input
                  className={`${ui.input} ${fieldErrors.reply_to ? styles.inputError : ""}`}
                  type="email"
                  value={replyToValue}
                  onChange={(e) => {
                    setReplyTo(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, reply_to: undefined }));
                  }}
                  placeholder="support@salanor.com"
                  autoComplete="off"
                  disabled={!canWrite}
                />
                {fieldErrors.reply_to ? (
                  <p className={styles.errorText}>{fieldErrors.reply_to}</p>
                ) : (
                  <p className={styles.hint}>
                    Where replies go if different from the From address.
                  </p>
                )}
              </label>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>SMTP configuration</h2>
              <p className={styles.sectionLead}>
                Preferred path for production. Works with Microsoft 365, Google Workspace,
                Postmark SMTP, or any standard mail host.
              </p>
            </div>
            <div className={styles.stack}>
              <label className={ui.field}>
                SMTP host
                <input
                  className={`${ui.input} ${fieldErrors.smtp_host ? styles.inputError : ""}`}
                  value={smtpHostValue}
                  onChange={(e) => {
                    setSmtpHost(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, smtp_host: undefined }));
                  }}
                  placeholder="smtp.office365.com"
                  autoComplete="off"
                  disabled={!canWrite}
                />
                {fieldErrors.smtp_host ? (
                  <p className={styles.errorText}>{fieldErrors.smtp_host}</p>
                ) : (
                  <p className={styles.hint}>
                    Examples: smtp.office365.com, smtp.gmail.com, smtp.postmarkapp.com
                  </p>
                )}
              </label>

              <div className={styles.twoCol}>
                <label className={ui.field}>
                  Port
                  <input
                    className={`${ui.input} ${fieldErrors.smtp_port ? styles.inputError : ""}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={smtpPortValue}
                    onChange={(e) => {
                      setSmtpPort(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, smtp_port: undefined }));
                    }}
                    disabled={!canWrite}
                  />
                  {fieldErrors.smtp_port ? (
                    <p className={styles.errorText}>{fieldErrors.smtp_port}</p>
                  ) : (
                    <p className={styles.hint}>587 for STARTTLS (common), or 465 for SSL.</p>
                  )}
                </label>
                <div>
                  <label className={styles.sslCheck}>
                    <input
                      type="checkbox"
                      checked={smtpSecureValue}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      disabled={!canWrite}
                    />
                    <span>
                      Use SSL (port 465)
                      <br />
                      <span className={styles.hint}>
                        Leave unchecked for STARTTLS on port 587.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className={styles.twoCol}>
                <label className={ui.field}>
                  SMTP username
                  <input
                    className={`${ui.input} ${fieldErrors.smtp_user ? styles.inputError : ""}`}
                    value={smtpUserValue}
                    onChange={(e) => {
                      setSmtpUser(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, smtp_user: undefined }));
                    }}
                    placeholder="notifications@salanor.com"
                    autoComplete="off"
                    disabled={!canWrite}
                  />
                  {fieldErrors.smtp_user ? (
                    <p className={styles.errorText}>{fieldErrors.smtp_user}</p>
                  ) : (
                    <p className={styles.hint}>Often the same as the From address.</p>
                  )}
                </label>
                <label className={ui.field}>
                  SMTP password
                  <input
                    className={`${ui.input} ${fieldErrors.smtp_password ? styles.inputError : ""}`}
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => {
                      setSmtpPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, smtp_password: undefined }));
                    }}
                    placeholder={
                      s.smtp_password_configured
                        ? "Saved. Enter a new password to replace it."
                        : "App password or mailbox password"
                    }
                    autoComplete="new-password"
                    disabled={!canWrite}
                  />
                  {fieldErrors.smtp_password ? (
                    <p className={styles.errorText}>{fieldErrors.smtp_password}</p>
                  ) : (
                    <p className={styles.hint}>
                      Stored encrypted. Leave blank to keep the current password.
                    </p>
                  )}
                </label>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Fallback</h2>
              <p className={styles.sectionLead}>
                Used when SMTP is not fully configured. Skip this if you already set{" "}
                <code className="mono">RESEND_API_KEY</code> in the environment.
              </p>
            </div>
            <div className={styles.stack}>
              <label className={ui.field}>
                Resend API key (optional)
                <input
                  className={ui.input}
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    s.key_configured
                      ? `Saved (${s.key_hint ?? "hidden"}). Paste a new key to replace.`
                      : "re_xxxxxxxx"
                  }
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={!canWrite}
                />
                <p className={styles.hint}>
                  Write-only and encrypted on save. Environment key remains the fallback if no key
                  is saved here.
                </p>
              </label>
            </div>
          </section>

          {canWrite ? (
            <div className={styles.actions}>
              <button
                type="submit"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={
                  save.isPending || (needsMasterForSecrets && !s.master_key_configured)
                }
              >
                {save.isPending ? "Saving…" : "Save settings"}
              </button>
              {s.key_configured || s.smtp_password_configured ? (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  disabled={clearSecrets.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove saved Resend key and SMTP password? Environment Resend fallback still applies if set.",
                      )
                    ) {
                      clearSecrets.mutate();
                    }
                  }}
                >
                  Clear saved secrets
                </button>
              ) : null}
              {saved ? (
                <span className={ui.muted} style={{ fontSize: "0.8125rem" }}>
                  Settings saved.
                </span>
              ) : null}
            </div>
          ) : (
            <p className={styles.footnote}>View only. Platform admin can change these settings.</p>
          )}

          {save.isError ? <ErrorAlert message={(save.error as Error).message} /> : null}
          {clearSecrets.isError ? (
            <ErrorAlert message={(clearSecrets.error as Error).message} />
          ) : null}

          <p className={styles.footnote}>
            Secrets are encrypted with the server master key and never returned by the API. Save
            before sending a test so the server uses the latest settings.
          </p>
        </form>
      ) : null}
    </OpsShell>
  );
}
