"use client";

import { Loader2, Plug, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import { adminCanWrite } from "@/lib/admin-session";
import { formatApiError } from "@/lib/format-api-error";
import { useAdminSession } from "@/hooks/use-admin-session";
import {
  fetchAdminProviders,
  fetchProviderModels,
  saveProvider,
  testProvider,
  type AllProvidersStatus,
  type ProviderKind,
  type StoaModel,
} from "@/lib/stoa-client";

const KINDS: ProviderKind[] = ["openai_compat", "anthropic", "google"];

const KIND_HINT: Partial<Record<ProviderKind, string>> = {
  openai_compat: "OpenAI, Azure OpenAI and compatible services.",
};

type KindForm = { baseUrl: string; apiKey: string; testing: boolean; verified: boolean };

export default function AdminProvidersPage() {
  const [activeKind, setActiveKind] = useState<ProviderKind>("openai_compat");
  const [status, setStatus] = useState<AllProvidersStatus | null>(null);
  const [note, setNote] = useState("");
  const [forms, setForms] = useState<Record<ProviderKind, KindForm>>({
    openai_compat: { baseUrl: "https://api.openai.com", apiKey: "", testing: false, verified: false },
    anthropic: { baseUrl: "https://api.anthropic.com", apiKey: "", testing: false, verified: false },
    google: {
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "",
      testing: false,
      verified: false,
    },
  });
  const [discovered, setDiscovered] = useState<StoaModel[]>([]);
  const [, setDiscoverSource] = useState<"tenant" | "none">("none");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogProvider, setCatalogProvider] = useState<ProviderKind | "all">("all");
  const [busyKind, setBusyKind] = useState<ProviderKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<ProviderKind | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const sessionQuery = useAdminSession();
  const canWrite = adminCanWrite(sessionQuery.data ?? null);

  const refreshModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await fetchProviderModels();
      setDiscovered(data.models);
      setDiscoverSource(data.source);
      if (data.error) {
        setError(formatApiError(data.error));
      }
    } catch {
      setDiscovered([]);
      setDiscoverSource("none");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminProviders()
      .then((data) => {
        setStatus(data);
        setNote(data.note ?? "");
        setForms((prev) => {
          const next = { ...prev };
          for (const k of KINDS) {
            next[k] = { ...next[k], baseUrl: data.providers[k].baseUrl };
          }
          return next;
        });
      })
      .catch((e: Error) => setError(e.message));
    void refreshModels();
  }, [refreshModels]);

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return discovered.filter((m) => {
      if (catalogProvider !== "all" && !m.id.startsWith(`${catalogProvider}:`)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q);
    });
  }, [catalogQuery, catalogProvider, discovered]);

  function patchForm(kind: ProviderKind, patch: Partial<KindForm>) {
    setForms((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  }

  async function handleSave(kind: ProviderKind) {
    setBusyKind(kind);
    setError(null);
    setSavedKind(null);
    setTestResult(null);
    const form = forms[kind];
    try {
      const result = await saveProvider(kind, {
        baseUrl: form.baseUrl,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      });
      setStatus(result);
      patchForm(kind, { apiKey: "", verified: false });
      setSavedKind(kind);
      await refreshModels();
      void sessionQuery.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKind(null);
    }
  }

  async function handleTest(kind: ProviderKind) {
    patchForm(kind, { testing: true });
    setError(null);
    setTestResult(null);
    const form = forms[kind];
    try {
      const result = await testProvider(kind, {
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        baseUrl: form.baseUrl,
      });
      if (result.ok) {
        patchForm(kind, { verified: true });
        setTestResult(`Connected. ${result.modelCount ?? 0} models available.`);
        if (result.models?.length) {
          setDiscovered((prev) => {
            const others = prev.filter((m) => !m.id.startsWith(`${kind}:`));
            return [...others, ...result.models!].sort((a, b) =>
              a.label.localeCompare(b.label),
            );
          });
          setDiscoverSource("tenant");
        } else {
          await refreshModels();
        }
      } else {
        patchForm(kind, { verified: false });
        setError(formatApiError(result.error ?? "Connection failed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      patchForm(kind, { testing: false });
    }
  }

  async function handleClearKey(kind: ProviderKind) {
    const label = status?.providers[kind].label ?? "this provider";
    if (!confirm(`Remove the key for ${label}?`)) {
      return;
    }
    setBusyKind(kind);
    try {
      const result = await saveProvider(kind, { clearKey: true });
      setStatus(result);
      patchForm(kind, { verified: false });
      await refreshModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKind(null);
    }
  }

  if (!status) {
    return <p className={ui.metaMuted}>Loading providers…</p>;
  }

  const anyConfigured = status.anyConfigured;
  const catalogLive =
    anyConfigured || discovered.length > 0 || KINDS.some((k) => forms[k].verified);
  const kind = activeKind;
  const meta = status.providers[kind];
  const form = forms[kind];
  const hint = KIND_HINT[kind];

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Providers</h1>
        <p className={ui.pageSubtitle}>
          Connect the AI services your organization uses.
        </p>
      </header>

      {error ? <div className={ui.alertError}>{error}</div> : null}
      {savedKind ? (
        <div className={ui.alertSuccess}>
          Saved {status.providers[savedKind].label} connection.
        </div>
      ) : null}
      {testResult ? <div className={ui.alertSuccess}>{testResult}</div> : null}

      <div className={ui.providerGrid}>
        <div>
          <div className={ui.toolbar} style={{ marginBottom: "0.75rem" }}>
            {KINDS.map((k) => {
              const p = status.providers[k];
              const dotOk = p.configured || forms[k].verified;
              return (
                <button
                  key={k}
                  type="button"
                  className={`${ui.btn} ${activeKind === k ? ui.btnPrimary : ui.btnSecondary}`}
                  onClick={() => setActiveKind(k)}
                >
                  <span
                    className={`${ui.statusDot} ${dotOk ? ui.statusDotOk : ui.statusDotOff}`}
                    style={{ marginRight: 6 }}
                    aria-hidden
                  />
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className={ui.card}>
            <p className={ui.cardLabel}>{meta.label}</p>
            <div className={ui.statusRow}>
              <span className={ui.metaMuted}>
                {meta.configured
                  ? `Connected${meta.keyHint ? ` (${meta.keyHint})` : ""}`
                  : form.verified
                    ? "Connected. Save to keep it."
                    : "Not connected"}
              </span>
            </div>
            {note ? (
              <p className={ui.metaMuted} style={{ margin: "0 0 1rem" }}>
                {note}
              </p>
            ) : null}
            {hint ? (
              <p className={ui.metaMuted} style={{ margin: "0 0 1rem" }}>
                {hint}
              </p>
            ) : null}
            <label className={ui.field}>
              API base URL
              <input
                type="url"
                value={form.baseUrl}
                onChange={(e) => patchForm(kind, { baseUrl: e.target.value })}
              />
            </label>
            <label className={ui.field}>
              API key
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => patchForm(kind, { apiKey: e.target.value })}
                placeholder={meta.configured ? "Leave blank to keep key" : "Paste key"}
                autoComplete="off"
              />
            </label>
            <div className={ui.toolbar}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={!canWrite || busyKind === kind}
                onClick={() => void handleSave(kind)}
              >
                {busyKind === kind ? (
                  <>
                    <Loader2 className={ui.spinner} aria-hidden />
                    Saving
                  </>
                ) : (
                  "Save connection"
                )}
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={
                  !canWrite ||
                  form.testing ||
                  (!meta.configured && !form.apiKey.trim())
                }
                onClick={() => void handleTest(kind)}
              >
                {form.testing ? (
                  <>
                    <Loader2 className={ui.spinner} aria-hidden />
                    Testing
                  </>
                ) : (
                  "Test connection"
                )}
              </button>
              {meta.configured ? (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  disabled={!canWrite || busyKind === kind}
                  onClick={() => void handleClearKey(kind)}
                >
                  Remove key
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className={ui.card} style={{ position: "sticky", top: "1rem" }}>
          <p className={ui.cardLabel}>Available models ({discovered.length})</p>
          {modelsLoading ? (
            <p className={ui.metaMuted}>
              <Loader2 className={ui.spinner} aria-hidden /> Loading models from
              providers…
            </p>
          ) : !catalogLive ? (
            <EmptyStatePanel
              icon={Plug}
              title="No providers connected"
              description="Add an API key to see models."
            />
          ) : discovered.length === 0 ? (
            <EmptyStatePanel
              icon={Plug}
              title="No models listed"
              description="Test the connection or refresh the list."
            />
          ) : (
            <>
              <div className={ui.toolbar} style={{ marginBottom: "0.75rem" }}>
                <label className={ui.field} style={{ flex: 1, marginBottom: 0 }}>
                  <span className={ui.metaMuted} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Search size={14} aria-hidden />
                    Search
                  </span>
                  <input
                    type="search"
                    value={catalogQuery}
                    placeholder="Search models"
                    onChange={(e) => setCatalogQuery(e.target.value)}
                  />
                </label>
                <label className={ui.field} style={{ marginBottom: 0, minWidth: "8rem" }}>
                  Provider
                  <select
                    value={catalogProvider}
                    onChange={(e) =>
                      setCatalogProvider(e.target.value as ProviderKind | "all")
                    }
                  >
                    <option value="all">All</option>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {status.providers[k].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={ui.tableWrap} style={{ maxHeight: "28rem", overflow: "auto" }}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.slice(0, 100).map((m) => (
                      <tr key={m.id}>
                        <td>{m.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredCatalog.length > 100 ? (
                <p className={ui.metaMuted} style={{ padding: "0.5rem 0 0" }}>
                  Showing 100 of {filteredCatalog.length} matches.
                </p>
              ) : null}
            </>
          )}
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "1rem" }}
            disabled={!anyConfigured && !catalogLive}
            onClick={() => void refreshModels()}
          >
            Refresh models
          </button>
        </div>
      </div>
    </div>
  );
}
