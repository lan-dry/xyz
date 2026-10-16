"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import ui from "@/components/admin-ui.module.css";
import { HighlightedUpstream } from "@/components/message-privacy";
import { adminCanWrite } from "@/lib/admin-session";
import {
  fetchAdminSettings,
  fetchSession,
  previewDlp,
  saveAdminSettings,
  type AdminSettings,
  type DlpPreview,
  type SessionInfo,
} from "@/lib/stoa-client";

const SAMPLE_BANK_MESSAGE =
  "Bonjour, le client Paul Ndongo (CNI 112233445, tél +237 699 12 34 56, paul.ndongo@gmail.com) " +
  "conteste un débit de 250 000 FCFA du 12/03/2026 sur la carte 4111 1111 1111 1111. " +
  "Compte 10005 00001 12345678901. Rédige une réponse polie et indique-lui de nous joindre " +
  "via support@afribank.cm ou la hotline +237 222 23 40 00.";

function splitEntries(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const DLP_PROFILES = [
  {
    id: "financial" as const,
    label: "Banking (recommended)",
    detail:
      "Emails, phone numbers, card numbers, account numbers, IBANs, ID and tax numbers, API keys.",
  },
  {
    id: "strict" as const,
    label: "Banking and network addresses",
    detail: "Everything above, plus IP addresses.",
  },
  {
    id: "standard" as const,
    label: "Contact details only",
    detail: "Emails and phone numbers.",
  },
];

const REVIEW_LEVELS = [
  {
    id: "metadata" as const,
    label: "Titles and dates only",
    detail: "No message text.",
  },
  {
    id: "redacted" as const,
    label: "Messages with protected values hidden (recommended)",
    detail: "Card numbers, accounts, emails and the like appear as placeholders.",
  },
  {
    id: "full" as const,
    label: "Full messages",
    detail: "For investigations. Limit admin access accordingly.",
  },
];

export default function AdminPolicyPage() {
  const [data, setData] = useState<AdminSettings | null>(null);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [dlpProfile, setDlpProfile] = useState<
    "standard" | "financial" | "strict"
  >("financial");
  const [customTerms, setCustomTerms] = useState("");
  const [testText, setTestText] = useState("");
  const [preview, setPreview] = useState<DlpPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [chatContentAccess, setChatContentAccess] = useState<
    "metadata" | "redacted" | "full"
  >("redacted");
  const [allowAttachments, setAllowAttachments] = useState(false);
  const [maxFileMb, setMaxFileMb] = useState(10);
  const [quotaEnforce, setQuotaEnforce] = useState(true);
  const [quotaUserMsg, setQuotaUserMsg] = useState(2000);
  const [quotaOrgMsg, setQuotaOrgMsg] = useState(50000);
  const [quotaOrgAttachMb, setQuotaOrgAttachMb] = useState(5120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const canWrite = adminCanWrite(session);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
    fetchAdminSettings()
      .then((next) => {
        setData(next);
        setEnabledIds(next.settings.enabledModelIds);
        setDefaultModelId(next.settings.defaultModelId);
        setDlpProfile(next.settings.dlp.profile);
        setCustomTerms((next.settings.dlp.customTerms ?? []).join("\n"));
        setChatContentAccess(
          next.settings.adminMask.chatContentAccess ?? "redacted",
        );
        setAllowAttachments(next.settings.uploads.allowAttachments);
        setMaxFileMb(next.settings.uploads.maxFileMb);
        setQuotaEnforce(next.settings.quotas.enforce);
        setQuotaUserMsg(next.settings.quotas.maxMessagesPerUserMonth);
        setQuotaOrgMsg(next.settings.quotas.maxMessagesOrgMonth);
        setQuotaOrgAttachMb(next.settings.quotas.maxAttachmentMbPerOrgMonth);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function pickRecommendedDefault(catalog: AdminSettings["availableModels"]) {
    const skip = (id: string) =>
      /tts|computer-use|deep-research|antigravity|embedding|imagen|veo/i.test(
        id,
      );
    const eligible = catalog.filter((m) => !skip(m.id));
    const prefer = [
      /gemini-2\.5-flash(?!.*preview)/i,
      /gemini-2\.0-flash/i,
      /gemini-1\.5-flash(?!.*tts)/i,
      /gemini-2\.5-pro/i,
      /gemini-1\.5-pro/i,
    ];
    for (const re of prefer) {
      const hit = eligible.find((m) => re.test(m.id) || re.test(m.label));
      if (hit) {
        return hit;
      }
    }
    return eligible[0] ?? null;
  }

  function toggleModel(id: string) {
    setEnabledIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      if (defaultModelId && !next.includes(defaultModelId)) {
        setDefaultModelId(next[0] ?? null);
      }
      return next;
    });
    markDirty();
  }

  function dlpPayload() {
    return {
      profile: dlpProfile,
      customTerms: splitEntries(customTerms),
    };
  }

  async function runPreview() {
    if (!testText.trim()) {
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      setPreview(await previewDlp({ text: testText, dlp: dlpPayload() }));
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSave() {
    if (data?.availableModels.length && enabledIds.length === 0) {
      setError("Enable at least one model.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await saveAdminSettings({
        enabledModelIds: enabledIds,
        defaultModelId,
        dlp: dlpPayload(),
        adminMask: { chatContentAccess },
        uploads: { allowAttachments, maxFileMb },
        quotas: {
          enforce: quotaEnforce,
          maxMessagesPerUserMonth: quotaUserMsg,
          maxMessagesOrgMonth: quotaOrgMsg,
          maxAttachmentMbPerOrgMonth: quotaOrgAttachMb,
        },
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              ...next,
              availableModels:
                next.availableModels?.length > 0
                  ? next.availableModels
                  : prev.availableModels,
              providerSource: next.providerSource ?? prev.providerSource,
              providerConfigured:
                next.providerConfigured ?? prev.providerConfigured,
              providerError: next.providerError ?? prev.providerError,
              providerErrors: next.providerErrors ?? prev.providerErrors,
              settings: next.settings,
              enabledModels: next.enabledModels ?? prev.enabledModels,
            }
          : next,
      );
      setEnabledIds(next.settings.enabledModelIds);
      setDefaultModelId(next.settings.defaultModelId);
      setDirty(false);
      setSaved(true);
      fetchSession().then(setSession).catch(() => setSession(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function renderSaveButton() {
    return (
      <button
        type="button"
        className={`${ui.btn} ${ui.btnPrimary}`}
        disabled={busy || !canWrite || !dirty}
        onClick={() => void handleSave()}
      >
        {busy ? "Saving…" : canWrite ? "Save" : "Read-only role"}
      </button>
    );
  }

  const catalog = data?.availableModels ?? [];
  const filteredCatalog = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) {
      return catalog;
    }
    return catalog.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.label ?? "").toLowerCase().includes(q),
    );
  }, [catalog, modelQuery]);

  if (!data) {
    return error ? (
      <div className={ui.alertError}>{error}</div>
    ) : (
      <p className={ui.metaMuted}>Loading policy…</p>
    );
  }

  const connected =
    data.providerSource !== "none" || data.providerConfigured === true;
  const errorEntries = Object.entries(data.providerErrors ?? {});
  const recommended = pickRecommendedDefault(catalog);

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Policy</h1>
        <p className={ui.pageSubtitle}>
          Models, data protection, attachments and monthly limits.
        </p>
      </header>

      <div className={ui.policyStickyBar}>
        <p className={ui.policyStickyMeta}>
          {dirty ? (
            <strong>Unsaved changes</strong>
          ) : saved ? (
            <strong>Saved</strong>
          ) : (
            "No changes"
          )}
        </p>
        {renderSaveButton()}
      </div>

      {error ? <div className={ui.alertError}>{error}</div> : null}
      {connected && catalog.length > 0 && enabledIds.length === 0 ? (
        <div className={ui.notice}>
          No model is enabled, so members can&apos;t chat yet.
          {canWrite && recommended ? (
            <div style={{ marginTop: "0.65rem" }}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => {
                  setEnabledIds([recommended.id]);
                  setDefaultModelId(recommended.id);
                  markDirty();
                }}
              >
                Enable {recommended.label || recommended.id}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {data.providerError ? (
        <div className={ui.alertError}>{data.providerError}</div>
      ) : null}
      {errorEntries.length > 0 ? (
        <div className={ui.card} style={{ marginBottom: "1rem" }}>
          <p className={ui.cardLabel}>Provider errors</p>
          <ul className={ui.metaMuted} style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {errorEntries.map(([kind, msg]) => (
              <li key={kind}>
                <span className={ui.mono}>{kind}</span>: {msg}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!connected ? (
        <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
          <p className={ui.cardLabel}>Models</p>
          <p className={ui.metaMuted}>
            No provider is connected. Add one in{" "}
            <Link href="/admin/providers">Providers</Link>.
          </p>
        </div>
      ) : catalog.length === 0 ? (
        <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
          <p className={ui.cardLabel}>Models</p>
          <p className={ui.metaMuted}>
            The provider returned no models. Check the key in{" "}
            <Link href="/admin/providers">Providers</Link>.
          </p>
        </div>
      ) : (
        <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Allowed models
          </h2>
          <div className={ui.toolbar}>
            <label className={ui.field} style={{ flex: 1, marginBottom: 0 }}>
              <span className={ui.metaMuted} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Search size={14} aria-hidden />
                Search
              </span>
              <input
                type="search"
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Model name"
              />
            </label>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => {
                setEnabledIds(filteredCatalog.map((m) => m.id));
                markDirty();
              }}
            >
              Enable all shown
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => {
                setEnabledIds([]);
                setDefaultModelId(null);
                markDirty();
              }}
            >
              Clear all
            </button>
          </div>
          <ul className={ui.checkList} style={{ maxHeight: "22rem", overflow: "auto" }}>
            {filteredCatalog.map((m) => (
              <li key={m.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={enabledIds.includes(m.id)}
                    onChange={() => toggleModel(m.id)}
                  />
                  <span className={ui.mono}>{m.id}</span>
                </label>
              </li>
            ))}
          </ul>
          {filteredCatalog.length === 0 ? (
            <p className={ui.metaMuted}>No models match your search.</p>
          ) : null}
          {enabledIds.length > 0 ? (
            <label className={ui.field}>
              Default for new conversations
              <select
                value={defaultModelId ?? ""}
                onChange={(e) => {
                  setDefaultModelId(e.target.value || null);
                  markDirty();
                }}
              >
                {enabledIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className={ui.metaMuted} style={{ margin: 0 }}>
            {enabledIds.length} of {catalog.length} enabled
          </p>
        </div>
      )}

      <div className={ui.policyTwoCol}>
        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Data protection
          </h2>
          <p className={ui.metaMuted} style={{ marginBottom: "1rem" }}>
            What is replaced with a placeholder before a message leaves your
            network. Members see the original values in the reply.
          </p>
          {DLP_PROFILES.map((p) => (
            <label key={p.id} className={ui.field} style={{ marginBottom: "0.75rem" }}>
              <span style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="dlpProfile"
                  checked={dlpProfile === p.id}
                  disabled={!canWrite}
                  onChange={() => {
                    setDlpProfile(p.id);
                    markDirty();
                  }}
                />
                <span>
                  <strong>{p.label}</strong>
                  <br />
                  <span className={ui.metaMuted}>{p.detail}</span>
                </span>
              </span>
            </label>
          ))}
          <label className={ui.field} style={{ marginTop: "1rem" }}>
            Confidential words
            <textarea
              rows={4}
              value={customTerms}
              disabled={!canWrite}
              onChange={(e) => {
                setCustomTerms(e.target.value);
                markDirty();
              }}
              placeholder={"Projet Atlas\nDossier Kribi"}
            />
          </label>
          <p className={ui.metaMuted} style={{ margin: 0 }}>
            Project names, client groups or internal codes that must never
            reach an AI provider. One per line.
          </p>
        </div>

        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Test a message
          </h2>
          <p className={ui.metaMuted} style={{ marginBottom: "0.75rem" }}>
            Shows what the provider would receive with the settings on this
            page, saved or not. Nothing is stored or sent.
          </p>
          <label className={ui.field}>
            Message
            <textarea
              rows={6}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Paste a message a member might send"
            />
          </label>
          <div className={ui.toolbar} style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={previewBusy || !testText.trim()}
              onClick={() => void runPreview()}
            >
              {previewBusy ? "Testing…" : "Run test"}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => {
                setTestText(SAMPLE_BANK_MESSAGE);
                setPreview(null);
              }}
            >
              Use an example
            </button>
          </div>
          {previewError ? (
            <div className={ui.alertError}>{previewError}</div>
          ) : null}
          {preview ? (
            <>
              <p className={ui.cardLabel}>Sent to the provider</p>
              <div
                className={ui.pre}
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                <HighlightedUpstream text={preview.upstream} />
              </div>
              {preview.items.length === 0 ? (
                <p className={ui.metaMuted} style={{ marginTop: "0.75rem" }}>
                  Nothing in this message would be withheld.
                </p>
              ) : (
                <>
                  <p className={ui.cardLabel} style={{ marginTop: "1rem" }}>
                    Withheld ({preview.redactionCount})
                  </p>
                  <div className={ui.tableWrap}>
                    <table className={ui.table}>
                      <thead>
                        <tr>
                          <th>Placeholder</th>
                          <th>Original value</th>
                          <th>What the model is told</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.items.map((item) => (
                          <tr key={item.token}>
                            <td className={ui.mono}>{item.token}</td>
                            <td className={ui.mono}>{item.value}</td>
                            <td>{item.modelHint ?? item.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>

        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Conversation review
          </h2>
          <p className={ui.metaMuted} style={{ marginBottom: "0.75rem" }}>
            What an admin sees when opening a member&apos;s conversation. Each
            opening is recorded in the audit log.
          </p>
          {REVIEW_LEVELS.map((opt) => (
            <label
              key={opt.id}
              className={ui.field}
              style={{ marginBottom: "0.75rem" }}
            >
              <span style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="chatContentAccess"
                  checked={chatContentAccess === opt.id}
                  disabled={!canWrite}
                  onChange={() => {
                    setChatContentAccess(opt.id);
                    markDirty();
                  }}
                />
                <span>
                  <strong>{opt.label}</strong>
                  <br />
                  <span className={ui.metaMuted}>{opt.detail}</span>
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Attachments
          </h2>
          <p className={ui.metaMuted} style={{ marginBottom: "1rem" }}>
            Files are checked for type and size, and their text goes through
            the same data protection as messages.
          </p>
          <ul className={ui.checkList}>
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={allowAttachments}
                  disabled={!canWrite}
                  onChange={(e) => {
                    setAllowAttachments(e.target.checked);
                    markDirty();
                  }}
                />
                Allow file attachments
              </label>
            </li>
          </ul>
          <label className={ui.field}>
            Max file size (MB)
            <input
              type="number"
              min={1}
              max={100}
              value={maxFileMb}
              disabled={!allowAttachments || !canWrite}
              onChange={(e) => {
                setMaxFileMb(Number(e.target.value));
                markDirty();
              }}
            />
          </label>
        </div>

        <div className={ui.card}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            Monthly limits
          </h2>
          <ul className={ui.checkList}>
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={quotaEnforce}
                  disabled={!canWrite}
                  onChange={(e) => {
                    setQuotaEnforce(e.target.checked);
                    markDirty();
                  }}
                />
                Enforce limits
              </label>
            </li>
          </ul>
          <label className={ui.field}>
            Messages per member
            <input
              type="number"
              min={0}
              value={quotaUserMsg}
              disabled={!quotaEnforce || !canWrite}
              onChange={(e) => {
                setQuotaUserMsg(Number(e.target.value));
                markDirty();
              }}
            />
          </label>
          <label className={ui.field}>
            Messages for the organization
            <input
              type="number"
              min={0}
              value={quotaOrgMsg}
              disabled={!quotaEnforce || !canWrite}
              onChange={(e) => {
                setQuotaOrgMsg(Number(e.target.value));
                markDirty();
              }}
            />
          </label>
          <label className={ui.field}>
            Attachment volume for the organization (MB)
            <input
              type="number"
              min={0}
              value={quotaOrgAttachMb}
              disabled={!quotaEnforce || !canWrite}
              onChange={(e) => {
                setQuotaOrgAttachMb(Number(e.target.value));
                markDirty();
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
