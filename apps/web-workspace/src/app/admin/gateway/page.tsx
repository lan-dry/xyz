"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import ui from "@/components/admin-ui.module.css";
import { adminCanWrite } from "@/lib/admin-session";
import {
  createGatewayCredential,
  fetchGatewayCredentials,
  fetchSession,
  revokeGatewayCredential,
  type GatewayCredential,
  type SessionInfo,
} from "@/lib/stoa-client";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${ui.btn} ${ui.btnSecondary}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function AdminGatewayPage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [credentials, setCredentials] = useState<GatewayCredential[]>([]);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<GatewayCredential | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = adminCanWrite(session);

  async function refresh() {
    const data = await fetchGatewayCredentials();
    setCredentials(data.credentials);
    setEndpoint(data.endpoint);
    setLoaded(true);
  }

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
    refresh().catch((e: Error) => {
      setError(e.message);
      setLoaded(true);
    });
  }, []);

  async function onCreate() {
    if (!name.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setRevealedKey(null);
    try {
      const created = await createGatewayCredential(name.trim());
      setRevealedKey(created.api_key);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeGatewayCredential(id);
      setRevokeTarget(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const active = credentials.filter((c) => !c.revokedAt);

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>API keys</h1>
        <p className={ui.pageSubtitle}>
          For internal systems that call AI models through Stoa. The same data
          protection, limits and audit log apply.
        </p>
      </header>

      {error ? <div className={ui.alertError}>{error}</div> : null}

      {endpoint ? (
        <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
          <p className={ui.cardLabel}>Endpoint</p>
          <div className={ui.toolbar} style={{ marginBottom: 0 }}>
            <code className={ui.mono} style={{ flex: 1, wordBreak: "break-all" }}>
              POST {endpoint}
            </code>
            <CopyButton value={endpoint} />
          </div>
          <p className={ui.metaMuted} style={{ margin: "0.75rem 0 0" }}>
            OpenAI-compatible. Send the key as{" "}
            <code className={ui.mono}>Authorization: Bearer &lt;key&gt;</code>.
          </p>
        </div>
      ) : null}

      {revealedKey ? (
        <div className={ui.alertSuccess}>
          <p style={{ margin: 0 }}>Copy this key now. It won&apos;t be shown again.</p>
          <pre className={ui.pre}>{revealedKey}</pre>
          <CopyButton value={revealedKey} />
        </div>
      ) : null}

      {canWrite ? (
        <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
          <label className={ui.field}>
            Name
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Loan processing service"
            />
          </label>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={busy || !name.trim()}
            onClick={() => void onCreate()}
          >
            {busy ? (
              <>
                <Loader2 className={ui.spinner} aria-hidden />
                Creating…
              </>
            ) : (
              <>
                <KeyRound size={16} style={{ marginRight: "0.35rem" }} />
                Create key
              </>
            )}
          </button>
        </div>
      ) : null}

      <div className={ui.card}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Active keys
        </h2>
        {!loaded ? (
          <p className={ui.metaMuted}>Loading…</p>
        ) : active.length === 0 ? (
          <p className={ui.metaMuted}>No API keys yet.</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className={ui.mono}>{c.keyPrefix}…</td>
                    <td className={ui.metaMuted}>
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className={ui.metaMuted}>
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {canWrite ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          disabled={busy}
                          onClick={() => setRevokeTarget(c)}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {revokeTarget ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Revoke key</h2>
            <p className={ui.modalDesc}>
              Systems using &quot;{revokeTarget.name}&quot; will stop working
              immediately.
            </p>
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setRevokeTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={busy}
                onClick={() => void onRevoke(revokeTarget.id)}
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
