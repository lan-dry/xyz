"use client";

import { useEffect, useState } from "react";

import ui from "@/components/admin-ui.module.css";
import { useRouter } from "next/navigation";

import { adminCanWrite, siteManagerOnly } from "@/lib/admin-session";
import {
  adminExportAuditBundleUrl,
  adminExportAuditUrl,
  adminExportUsageUrl,
  fetchAdminComplianceStatus,
  fetchAdminSettings,
  fetchSession,
  runAdminRetention,
  saveAdminSettings,
  testAdminSiemWebhook,
  type SessionInfo,
} from "@/lib/stoa-client";

type ComplianceForm = {
  retentionEnforce: boolean;
  scheduleEnabled: boolean;
  scheduleUtcHour: string;
  msgDays: string;
  threadDays: string;
  attachDays: string;
  siemUrl: string;
  siemSecret: string;
  siemOnRetention: boolean;
  siemStream: boolean;
  exportSigningSecret: string;
};

const EMPTY_FORM: ComplianceForm = {
  retentionEnforce: false,
  scheduleEnabled: false,
  scheduleUtcHour: "3",
  msgDays: "",
  threadDays: "",
  attachDays: "",
  siemUrl: "",
  siemSecret: "",
  siemOnRetention: false,
  siemStream: false,
  exportSigningSecret: "",
};

function sameForm(a: ComplianceForm, b: ComplianceForm): boolean {
  return (Object.keys(a) as (keyof ComplianceForm)[]).every(
    (key) => a[key] === b[key],
  );
}

function dayStartIso(date: string): string | undefined {
  return date ? `${date}T00:00:00.000Z` : undefined;
}

function dayEndIso(date: string): string | undefined {
  return date ? `${date}T23:59:59.999Z` : undefined;
}

export default function AdminCompliancePage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [form, setForm] = useState<ComplianceForm>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<ComplianceForm | null>(null);
  const [signingConfigured, setSigningConfigured] = useState(false);
  const [secretsSet, setSecretsSet] = useState({ siem: false, signing: false });
  const [confirmRun, setConfirmRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWrite = adminCanWrite(session);
  const dirty = baseline !== null && !sameForm(form, baseline);
  const retentionOn = baseline?.retentionEnforce ?? false;
  const siemConfigured = Boolean(baseline?.siemUrl.trim());

  function update<K extends keyof ComplianceForm>(
    key: K,
    value: ComplianceForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  useEffect(() => {
    fetchSession()
      .then((me) => {
        if (siteManagerOnly(me)) {
          router.replace("/admin/sites");
          return;
        }
        setSession(me);
      })
      .catch((e: Error) => setError(e.message));
    fetchAdminSettings()
      .then((s) => {
        const { retention, compliance } = s.settings;
        const loaded: ComplianceForm = {
          retentionEnforce: retention.enforce,
          scheduleEnabled: retention.scheduleEnabled,
          scheduleUtcHour: String(retention.scheduleUtcHour ?? 3),
          msgDays: retention.messageRetentionDays?.toString() ?? "",
          threadDays: retention.threadRetentionDays?.toString() ?? "",
          attachDays: retention.attachmentRetentionDays?.toString() ?? "",
          siemUrl: compliance.siemWebhookUrl ?? "",
          siemSecret: "",
          siemOnRetention: compliance.siemNotifyOnRetentionRun,
          siemStream: compliance.siemStreamAuditEvents,
          exportSigningSecret: "",
        };
        setForm(loaded);
        setBaseline(loaded);
        setSecretsSet({
          siem: compliance.siemWebhookSecretSet,
          signing: compliance.exportSigningSecretSet,
        });
      })
      .catch((e: Error) => setError(e.message));
    fetchAdminComplianceStatus()
      .then((s) => setSigningConfigured(s.exportSigningConfigured))
      .catch((e: Error) => setError(e.message));
  }, [router]);

  async function onSave() {
    setBusy(true);
    setSaving(true);
    setError(null);
    setMessage(null);
    const snapshot = form;
    try {
      await saveAdminSettings({
        retention: {
          enforce: snapshot.retentionEnforce,
          messageRetentionDays: snapshot.msgDays ? Number(snapshot.msgDays) : null,
          threadRetentionDays: snapshot.threadDays
            ? Number(snapshot.threadDays)
            : null,
          attachmentRetentionDays: snapshot.attachDays
            ? Number(snapshot.attachDays)
            : null,
          scheduleEnabled: snapshot.scheduleEnabled,
          scheduleUtcHour: Number(snapshot.scheduleUtcHour),
        },
        compliance: {
          siemWebhookUrl: snapshot.siemUrl.trim() || null,
          siemWebhookSecret: snapshot.siemSecret.trim() || undefined,
          siemNotifyOnRetentionRun: snapshot.siemOnRetention,
          siemStreamAuditEvents: snapshot.siemStream,
          exportSigningSecret: snapshot.exportSigningSecret.trim() || undefined,
        },
      });
      const cleared = { ...snapshot, siemSecret: "", exportSigningSecret: "" };
      setSecretsSet((prev) => ({
        siem: prev.siem || Boolean(snapshot.siemSecret.trim()),
        signing: prev.signing || Boolean(snapshot.exportSigningSecret.trim()),
      }));
      setForm(cleared);
      setBaseline(cleared);
      setMessage("Saved.");
      const status = await fetchAdminComplianceStatus();
      setSigningConfigured(status.exportSigningConfigured);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }

  async function removeSecret(which: "siem" | "signing") {
    const label =
      which === "siem" ? "SIEM webhook secret" : "audit signing key";
    if (
      !window.confirm(
        `Remove the ${label}? Exports or SIEM delivery that depend on it will stop working until you set a new one.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveAdminSettings({
        compliance:
          which === "siem"
            ? { siemWebhookSecret: null }
            : { exportSigningSecret: null },
      });
      setSecretsSet((prev) => ({ ...prev, [which]: false }));
      const status = await fetchAdminComplianceStatus();
      setSigningConfigured(status.exportSigningConfigured);
      setMessage("Removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRunRetention() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await runAdminRetention();
      setMessage(
        `Deleted ${res.result.messagesDeleted} messages, ${res.result.threadsDeleted} conversations, ${res.result.attachmentsDeleted} files.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirmRun(false);
    }
  }

  async function onTestSiem() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await testAdminSiemWebhook();
      setMessage("Test sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const fromIso = dayStartIso(auditFrom);
  const toIso = dayEndIso(auditTo);
  const runHint = dirty
    ? "Save first."
    : baseline && !retentionOn
      ? "Retention is turned off."
      : null;

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Compliance</h1>
      </header>

      {canWrite ? (
        <div className={ui.policyStickyBar}>
          <p className={ui.policyStickyMeta}>
            {dirty ? <strong>Unsaved changes</strong> : "No changes"}
          </p>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={busy || !dirty}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}

      {error ? <div className={ui.alertError}>{error}</div> : null}
      {message ? <div className={ui.alertSuccess}>{message}</div> : null}

      <div className={ui.policyTwoCol}>
      <div className={ui.card}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Exports
        </h2>
        <div className={ui.filterBar}>
          <label className={ui.filterField}>
            <span className={ui.filterLabel}>From</span>
            <input
              type="date"
              className={ui.filterControl}
              value={auditFrom}
              max={auditTo || undefined}
              onChange={(e) => setAuditFrom(e.target.value)}
            />
          </label>
          <label className={ui.filterField}>
            <span className={ui.filterLabel}>To</span>
            <input
              type="date"
              className={ui.filterControl}
              value={auditTo}
              min={auditFrom || undefined}
              onChange={(e) => setAuditTo(e.target.value)}
            />
          </label>
        </div>
        <div className={ui.toolbar}>
          <a
            className={`${ui.btn} ${ui.btnSecondary}`}
            href={adminExportAuditUrl(fromIso, toIso)}
          >
            Download audit CSV
          </a>
          <a className={`${ui.btn} ${ui.btnSecondary}`} href={adminExportUsageUrl("csv")}>
            Download usage CSV
          </a>
          <a className={`${ui.btn} ${ui.btnSecondary}`} href={adminExportUsageUrl("json")}>
            Download usage JSON
          </a>
          {signingConfigured ? (
            <a
              className={`${ui.btn} ${ui.btnSecondary}`}
              href={adminExportAuditBundleUrl(fromIso, toIso)}
            >
              Download signed audit file
            </a>
          ) : (
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled
            >
              Download signed audit file
            </button>
          )}
        </div>
        {!signingConfigured ? (
          <p className={ui.metaMuted}>Add a signing key below to enable.</p>
        ) : null}
        <label className={ui.field}>
          Audit file signing key
          <input
            type="password"
            value={form.exportSigningSecret}
            disabled={!canWrite}
            placeholder={secretsSet.signing ? "Saved. Type a new key to replace it." : ""}
            onChange={(e) => update("exportSigningSecret", e.target.value)}
            autoComplete="off"
          />
        </label>
        {canWrite && secretsSet.signing ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={busy}
            onClick={() => void removeSecret("signing")}
          >
            Remove key
          </button>
        ) : null}
      </div>

      <div className={ui.card}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Retention
        </h2>
        <p className={ui.metaMuted}>Delete data older than the limits below.</p>
        <ul className={ui.checkList}>
          <li>
            <label>
              <input
                type="checkbox"
                checked={form.retentionEnforce}
                disabled={!canWrite}
                onChange={(e) => update("retentionEnforce", e.target.checked)}
              />
              Turn on retention
            </label>
          </li>
          <li>
            <label>
              <input
                type="checkbox"
                checked={form.scheduleEnabled}
                disabled={!canWrite}
                onChange={(e) => update("scheduleEnabled", e.target.checked)}
              />
              Run daily
            </label>
          </li>
        </ul>
        <label className={ui.field}>
          Time (UTC)
          <input
            type="number"
            min={0}
            max={23}
            disabled={!canWrite}
            value={form.scheduleUtcHour}
            onChange={(e) => update("scheduleUtcHour", e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Messages (days)
          <input
            type="number"
            min={1}
            disabled={!canWrite}
            value={form.msgDays}
            onChange={(e) => update("msgDays", e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Empty conversations (days)
          <input
            type="number"
            min={1}
            disabled={!canWrite}
            value={form.threadDays}
            onChange={(e) => update("threadDays", e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Unsent files (days)
          <input
            type="number"
            min={1}
            disabled={!canWrite}
            value={form.attachDays}
            onChange={(e) => update("attachDays", e.target.value)}
          />
        </label>
        <div className={ui.toolbar}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={!canWrite || busy || dirty || !retentionOn}
            onClick={() => setConfirmRun(true)}
          >
            Run retention now
          </button>
          {canWrite && runHint ? (
            <span className={ui.metaMuted}>{runHint}</span>
          ) : null}
        </div>
      </div>
      </div>

      <div className={ui.card} style={{ marginTop: "1.25rem" }}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Security monitoring (SIEM)
        </h2>
        <label className={ui.field}>
          Webhook URL
          <input
            value={form.siemUrl}
            disabled={!canWrite}
            onChange={(e) => update("siemUrl", e.target.value)}
            placeholder="https://siem.example.com/ingest/stoa"
          />
        </label>
        <label className={ui.field}>
          Webhook secret (optional)
          <input
            type="password"
            value={form.siemSecret}
            disabled={!canWrite}
            placeholder={secretsSet.siem ? "Saved. Type a new secret to replace it." : ""}
            onChange={(e) => update("siemSecret", e.target.value)}
            autoComplete="off"
          />
        </label>
        {canWrite && secretsSet.siem ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginBottom: "0.75rem" }}
            disabled={busy}
            onClick={() => void removeSecret("siem")}
          >
            Remove secret
          </button>
        ) : null}
        <ul className={ui.checkList}>
          <li>
            <label>
              <input
                type="checkbox"
                checked={form.siemOnRetention}
                disabled={!canWrite}
                onChange={(e) => update("siemOnRetention", e.target.checked)}
              />
              Notify after retention runs
            </label>
          </li>
          <li>
            <label>
              <input
                type="checkbox"
                checked={form.siemStream}
                disabled={!canWrite}
                onChange={(e) => update("siemStream", e.target.checked)}
              />
              Send each audit event as it happens
            </label>
          </li>
        </ul>
        <div className={ui.toolbar}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={!canWrite || busy || dirty || !siemConfigured}
            onClick={() => void onTestSiem()}
          >
            Send test event
          </button>
          {canWrite && dirty ? (
            <span className={ui.metaMuted}>Save first.</span>
          ) : null}
        </div>
      </div>

      {confirmRun ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Run retention now</h2>
            <p className={ui.modalDesc}>
              Data older than the saved limits will be deleted. This can&apos;t
              be undone.
            </p>
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={busy}
                onClick={() => setConfirmRun(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={busy}
                onClick={() => void onRunRetention()}
              >
                Delete data
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
