"use client";

import { History, Plus, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import { RowMenu } from "@/components/console/row-menu";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { ApiError, consoleApi } from "@/lib/api";
import { formatRelativeTime } from "@/lib/relative-time";
import type {
  SourceHistory,
  SourceHistoryEvent,
  SourceSummary,
} from "@/lib/types";

const KIND_OPTIONS: Array<{ value: SourceSummary["kind"]; label: string }> = [
  { value: "application", label: "Business application" },
  { value: "executor", label: "System that carries out actions" },
  { value: "collector", label: "Log or data collector" },
  { value: "third_party", label: "Third party" },
];

function kindLabel(kind: string): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind;
}

function historyLabel(e: SourceHistoryEvent): string {
  const key = e.key_id ? ` (${e.key_id})` : "";
  switch (e.action) {
    case "registered":
      return "Source registered";
    case "key_added":
      return `Key added${key}`;
    case "key_rotated":
      return `Key replaced${key}`;
    case "key_revoked": {
      const reason = typeof e.detail.reason === "string" ? `: ${e.detail.reason}` : "";
      return `Key revoked${key}${reason}`;
    }
    case "source_disabled":
      return "Source disabled";
    default:
      return e.action;
  }
}

type NewKeyForm = { keyId: string; publicKey: string };
const EMPTY_KEY: NewKeyForm = { keyId: "", publicKey: "" };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export default function SourcesPage() {
  const queryClient = useQueryClient();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [kind, setKind] = useState<SourceSummary["kind"]>("application");
  const [ownerContact, setOwnerContact] = useState("");
  const [firstKey, setFirstKey] = useState<NewKeyForm>(EMPTY_KEY);

  const [rotateFor, setRotateFor] = useState<SourceSummary | null>(null);
  const [rotateKey, setRotateKey] = useState<NewKeyForm>(EMPTY_KEY);

  const [revokeFor, setRevokeFor] = useState<SourceSummary | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const [disableFor, setDisableFor] = useState<SourceSummary | null>(null);
  const [disableReason, setDisableReason] = useState("");

  const [historyFor, setHistoryFor] = useState<SourceSummary | null>(null);

  const sourcesQuery = useQuery({
    queryKey: ["console", "sources"],
    queryFn: () => consoleApi<{ sources: SourceSummary[] }>("/sources"),
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  const historyQuery = useQuery({
    queryKey: ["console", "sources", historyFor?.source_id, "history"],
    queryFn: () =>
      consoleApi<SourceHistory>(
        `/sources/${encodeURIComponent(historyFor!.source_id)}/history`,
      ),
    enabled: Boolean(historyFor),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["console", "sources"] });
  }

  const register = useMutation({
    mutationFn: () =>
      consoleApi<{ source: SourceSummary }>("/sources", {
        method: "POST",
        body: JSON.stringify({
          source_id: sourceId.trim(),
          name: name.trim(),
          kind,
          owner_contact: ownerContact.trim() || undefined,
          key_id: firstKey.keyId.trim(),
          public_key_b64: firstKey.publicKey.trim(),
        }),
      }),
    onSuccess: () => {
      setRegisterOpen(false);
      setName("");
      setSourceId("");
      setOwnerContact("");
      setKind("application");
      setFirstKey(EMPTY_KEY);
      refresh();
    },
  });

  const rotate = useMutation({
    mutationFn: (source: SourceSummary) =>
      consoleApi<{ key: unknown }>(
        `/sources/${encodeURIComponent(source.source_id)}/keys`,
        {
          method: "POST",
          body: JSON.stringify({
            key_id: rotateKey.keyId.trim(),
            public_key_b64: rotateKey.publicKey.trim(),
          }),
        },
      ),
    onSuccess: () => {
      setRotateFor(null);
      setRotateKey(EMPTY_KEY);
      refresh();
    },
  });

  const revoke = useMutation({
    mutationFn: (source: SourceSummary) =>
      consoleApi<{ key: unknown }>(
        `/sources/${encodeURIComponent(source.source_id)}/keys/${encodeURIComponent(
          source.active_key!.key_id,
        )}/revoke`,
        { method: "POST", body: JSON.stringify({ reason: revokeReason.trim() }) },
      ),
    onSuccess: () => {
      setRevokeFor(null);
      setRevokeReason("");
      refresh();
    },
  });

  const disable = useMutation({
    mutationFn: (source: SourceSummary) =>
      consoleApi<{ source: SourceSummary }>(
        `/sources/${encodeURIComponent(source.source_id)}/disable`,
        {
          method: "POST",
          body: JSON.stringify(
            disableReason.trim() ? { reason: disableReason.trim() } : {},
          ),
        },
      ),
    onSuccess: () => {
      setDisableFor(null);
      setDisableReason("");
      refresh();
    },
  });

  const sources = useMemo(() => sourcesQuery.data?.sources ?? [], [sourcesQuery.data]);
  const activeCount = sources.filter((s) => s.status === "active").length;
  const gapSources = sources.filter((s) => s.open_gap_count > 0).length;
  const hasSources = sources.length > 0;
  const forbidden =
    sourcesQuery.error instanceof ApiError && sourcesQuery.error.status === 403;

  const registerReady =
    name.trim() && sourceId.trim() && firstKey.keyId.trim() && firstKey.publicKey.trim();
  const rotateReady = rotateKey.keyId.trim() && rotateKey.publicKey.trim();

  return (
    <ConsolePage>
      <PageHeader
        title="Sources"
        subtitle="The systems allowed to send signed events to Aegis. Each event is checked against the source's registered key before it is recorded."
      />
      {!forbidden ? (
        <div className={ui.toolbar} style={{ justifyContent: "flex-end", marginTop: 0 }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            onClick={() => setRegisterOpen(true)}
          >
            <Plus size={16} aria-hidden />
            Register source
          </button>
        </div>
      ) : null}

      {forbidden ? (
        <ErrorAlert message="Only administrators can manage sources." />
      ) : sourcesQuery.error ? (
        <ErrorAlert message="Failed to load sources." />
      ) : null}
      {sourcesQuery.isLoading ? <LoadingBlock /> : null}

      {hasSources ? (
        <div className={ui.statStrip}>
          <span>
            <strong>{sources.length}</strong> sources
          </span>
          <span>
            <strong>{activeCount}</strong> active
          </span>
          <span>
            <strong>{gapSources}</strong> with missing events
          </span>
        </div>
      ) : null}

      {!sourcesQuery.isLoading && !forbidden && !sourcesQuery.error && !hasSources ? (
        <EmptyStatePanel
          icon={Radio}
          title="No sources yet"
          description="Register each system that sends events (for example your loan system) together with its public key. Aegis then accepts only events signed by that key."
          action={
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() => setRegisterOpen(true)}
            >
              <Plus size={16} aria-hidden />
              Register source
            </button>
          }
        />
      ) : null}

      {hasSources ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Active key</th>
                <th>Last event</th>
                <th>Last number</th>
                <th>Missing events</th>
                <th style={{ width: "3rem" }} />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source_id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className={ui.muted}>
                      <code>{s.source_id}</code> · {kindLabel(s.kind)}
                    </div>
                    {s.owner_contact ? (
                      <div className={ui.muted}>Owner: {s.owner_contact}</div>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={`${ui.badge} ${
                        s.status === "active" ? ui.badgeSuccess : ui.badgeMuted
                      }`}
                    >
                      {s.status === "active" ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    {s.active_key ? (
                      <>
                        <code className={ui.tokenPill} title="First and last characters of the public key">
                          {s.active_key.fingerprint}
                        </code>
                        <div className={ui.muted}>{s.active_key.key_id}</div>
                      </>
                    ) : (
                      <span className={`${ui.badge} ${ui.badgeDanger}`}>No usable key</span>
                    )}
                  </td>
                  <td className={ui.muted}>{formatRelativeTime(s.last_event_at)}</td>
                  <td className={ui.muted}>{s.last_seq > 0 ? s.last_seq : "None yet"}</td>
                  <td>
                    {s.open_gap_count > 0 ? (
                      <span className={`${ui.badge} ${ui.badgeWarning}`}>
                        {s.open_gap_count} {s.open_gap_count === 1 ? "gap" : "gaps"}
                      </span>
                    ) : (
                      <span className={ui.muted}>None</span>
                    )}
                  </td>
                  <td>
                    <RowMenu
                      items={[
                        {
                          label: "Replace key",
                          onClick: () => {
                            setRotateKey(EMPTY_KEY);
                            rotate.reset();
                            setRotateFor(s);
                          },
                        },
                        ...(s.active_key
                          ? [
                              {
                                label: "Revoke key",
                                danger: true,
                                onClick: () => {
                                  setRevokeReason("");
                                  revoke.reset();
                                  setRevokeFor(s);
                                },
                              },
                            ]
                          : []),
                        ...(s.status === "active"
                          ? [
                              {
                                label: "Disable source",
                                danger: true,
                                onClick: () => {
                                  setDisableReason("");
                                  disable.reset();
                                  setDisableFor(s);
                                },
                              },
                            ]
                          : []),
                        { label: "History", onClick: () => setHistoryFor(s) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={ui.tableFooter}>
            {sources.length} {sources.length === 1 ? "source" : "sources"}. A gap means some
            event numbers never arrived from that source.
          </p>
        </div>
      ) : null}

      {/* Register */}
      <Modal
        open={registerOpen}
        title="Register source"
        description="Generate a key pair on the sending system (for example with the Aegis Connector) and paste only the public key here. The private key never leaves that system."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!register.isPending) setRegisterOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setRegisterOpen(false)}
              disabled={register.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!registerReady || register.isPending}
              onClick={() => register.mutate()}
            >
              {register.isPending ? "Registering…" : "Register"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Name
          <input
            className={ui.input}
            type="text"
            placeholder="Loan origination system"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className={ui.field}>
          Source ID
          <input
            className={ui.input}
            type="text"
            placeholder="src_los"
            maxLength={128}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Type
          <select
            className={ui.input}
            value={kind}
            onChange={(e) => setKind(e.target.value as SourceSummary["kind"])}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field}>
          Who owns it (optional)
          <input
            className={ui.input}
            type="text"
            placeholder="payments-ops@example.com"
            value={ownerContact}
            onChange={(e) => setOwnerContact(e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Key ID
          <input
            className={ui.input}
            type="text"
            placeholder="k_los_2026_01"
            maxLength={128}
            value={firstKey.keyId}
            onChange={(e) => setFirstKey({ ...firstKey, keyId: e.target.value })}
          />
        </label>
        <label className={ui.field}>
          Public key
          <textarea
            className={ui.input}
            rows={3}
            placeholder="Paste the public key (base64)"
            value={firstKey.publicKey}
            onChange={(e) => setFirstKey({ ...firstKey, publicKey: e.target.value })}
          />
        </label>
        {register.isError ? <ErrorAlert message={errorText(register.error)} /> : null}
      </Modal>

      {/* Replace key */}
      <Modal
        open={Boolean(rotateFor)}
        title="Replace key"
        description={
          rotateFor
            ? `Add a new key for ${rotateFor.name}. The current key stops being accepted straight away, so switch the sending system to the new key first.`
            : undefined
        }
        closeOnOverlayClick={false}
        onClose={() => {
          if (!rotate.isPending) setRotateFor(null);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setRotateFor(null)}
              disabled={rotate.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!rotateReady || rotate.isPending}
              onClick={() => rotateFor && rotate.mutate(rotateFor)}
            >
              {rotate.isPending ? "Saving…" : "Replace key"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          New key ID
          <input
            className={ui.input}
            type="text"
            placeholder="k_los_2026_02"
            maxLength={128}
            value={rotateKey.keyId}
            onChange={(e) => setRotateKey({ ...rotateKey, keyId: e.target.value })}
            autoFocus
          />
        </label>
        <label className={ui.field}>
          New public key
          <textarea
            className={ui.input}
            rows={3}
            placeholder="Paste the public key (base64)"
            value={rotateKey.publicKey}
            onChange={(e) => setRotateKey({ ...rotateKey, publicKey: e.target.value })}
          />
        </label>
        {rotate.isError ? <ErrorAlert message={errorText(rotate.error)} /> : null}
      </Modal>

      {/* Revoke key */}
      <Modal
        open={Boolean(revokeFor)}
        title="Revoke key"
        description={
          revokeFor?.active_key
            ? `Events signed with ${revokeFor.active_key.key_id} will be refused from now on. Use this if the key may have been exposed. The reason is kept in the history.`
            : undefined
        }
        closeOnOverlayClick={false}
        onClose={() => {
          if (!revoke.isPending) setRevokeFor(null);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setRevokeFor(null)}
              disabled={revoke.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnDanger}`}
              disabled={!revokeReason.trim() || revoke.isPending}
              onClick={() => revokeFor && revoke.mutate(revokeFor)}
            >
              {revoke.isPending ? "Revoking…" : "Revoke key"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Reason
          <textarea
            className={ui.input}
            rows={3}
            placeholder="For example: laptop lost, key found in a log file"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            autoFocus
          />
        </label>
        {revoke.isError ? <ErrorAlert message={errorText(revoke.error)} /> : null}
      </Modal>

      {/* Disable source */}
      <Modal
        open={Boolean(disableFor)}
        title="Disable source"
        description={
          disableFor
            ? `Aegis will refuse every new event from ${disableFor.name}. Existing sealed events stay on the ledger. Re-enable is not offered here — register a new source if you need to send again.`
            : undefined
        }
        closeOnOverlayClick={false}
        onClose={() => {
          if (!disable.isPending) setDisableFor(null);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setDisableFor(null)}
              disabled={disable.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnDanger}`}
              disabled={disable.isPending}
              onClick={() => disableFor && disable.mutate(disableFor)}
            >
              {disable.isPending ? "Disabling…" : "Disable source"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Reason (optional)
          <textarea
            className={ui.input}
            rows={3}
            placeholder="For example: system decommissioned"
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            autoFocus
          />
        </label>
        {disable.isError ? <ErrorAlert message={errorText(disable.error)} /> : null}
      </Modal>

      {/* History */}
      <Modal
        open={Boolean(historyFor)}
        title={historyFor ? `History: ${historyFor.name}` : "History"}
        description="Every change to this source and its keys, newest first."
        wide
        onClose={() => setHistoryFor(null)}
        footer={
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={() => setHistoryFor(null)}
          >
            Close
          </button>
        }
      >
        {historyQuery.isLoading ? <LoadingBlock /> : null}
        {historyQuery.error ? <ErrorAlert message="Failed to load history." /> : null}
        {historyQuery.data ? (
          <>
            {historyQuery.data.gaps.length > 0 ? (
              <div className={`${ui.alert} ${ui.alertError}`} style={{ marginBottom: "1rem" }}>
                <strong>Events that never arrived</strong>
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                  {historyQuery.data.gaps.map((g) => (
                    <li key={g.from_seq}>
                      {g.from_seq === g.to_seq
                        ? `Number ${g.from_seq}`
                        : `Numbers ${g.from_seq} to ${g.to_seq}`}
                      {" · noticed "}
                      {formatRelativeTime(g.detected_at)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>What happened</th>
                    <th>Who</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.events.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <History size={14} aria-hidden style={{ marginRight: "0.375rem" }} />
                        {historyLabel(e)}
                      </td>
                      <td className={ui.muted}>{e.actor ?? "System"}</td>
                      <td className={ui.muted}>{formatRelativeTime(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Modal>
    </ConsolePage>
  );
}
