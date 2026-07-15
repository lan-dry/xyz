"use client";

import { Code2, Download, KeyRound, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import optionStyles from "@/components/console/modal.module.css";
import bulkStyles from "@/components/console/bulk-bar.module.css";
import { CopyButton } from "@/components/console/copy-button";
import { RowMenu } from "@/components/console/row-menu";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { formatRelativeTime, keyPermissionLabel } from "@/lib/relative-time";
import type { IngestKeySummary } from "@/lib/types";

type KeyPermission = "ingest_write" | "ingest_read";

export default function IngestKeysPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editKey, setEditKey] = useState<IngestKeySummary | null>(null);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<KeyPermission>("ingest_write");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [permFilter, setPermFilter] = useState<"all" | "full" | "read">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const keysQuery = useQuery({
    queryKey: ["console", "ingest-keys"],
    queryFn: () => consoleApi<{ keys: IngestKeySummary[] }>("/ingest-keys"),
  });

  const createKey = useMutation({
    mutationFn: (keyName: string) =>
      consoleApi<{ key: IngestKeySummary; secret: string }>("/ingest-keys", {
        method: "POST",
        body: JSON.stringify({ name: keyName }),
      }),
    onSuccess: (data) => {
      setCreatedSecret(data.secret);
      setName("");
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["console", "ingest-keys"] });
    },
  });

  const renameKey = useMutation({
    mutationFn: ({ keyId, keyName }: { keyId: string; keyName: string }) =>
      consoleApi<{ key: IngestKeySummary }>(
        `/ingest-keys/${encodeURIComponent(keyId)}`,
        { method: "PATCH", body: JSON.stringify({ name: keyName }) },
      ),
    onSuccess: () => {
      setEditKey(null);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["console", "ingest-keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: (keyId: string) =>
      consoleApi<{ ok: boolean }>(`/ingest-keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["console", "ingest-keys"] });
    },
  });

  const allKeys = keysQuery.data?.keys ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allKeys.filter((k) => {
      if (permFilter === "full" && k.name.includes("[read-only]")) return false;
      if (permFilter === "read" && !k.name.includes("[read-only]")) return false;
      if (!q) return true;
      return (
        k.name.toLowerCase().includes(q) ||
        k.key_prefix.toLowerCase().includes(q)
      );
    });
  }, [allKeys, search, permFilter]);

  const activeCount = allKeys.filter((k) => k.active).length;
  const hasKeys = allKeys.length > 0;
  const allSelected =
    filtered.length > 0 && filtered.every((k) => selected.has(k.key_id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((k) => k.key_id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const rows = [
      ["name", "prefix", "permission", "status", "created", "last_used"].join(","),
      ...filtered.map((k) =>
        [
          JSON.stringify(k.name),
          k.key_prefix,
          keyPermissionLabel(k.name),
          k.active ? "active" : "revoked",
          k.created_at,
          k.last_used_at ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aegis-ingest-keys.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ConsolePage>
      <PageHeader
        title="API keys"
        subtitle="Create and revoke ingest keys for agent event submission to your organization ledger."
      />
      <div className={ui.toolbar} style={{ justifyContent: "flex-end", marginTop: 0 }}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary}`}
          title="Ingest API reference"
          onClick={() =>
            window.open(
              `${process.env.NEXT_PUBLIC_DOCS_BASE_URL ?? "http://localhost:3002"}/aegis`,
              "_blank",
            )
          }
        >
          <Code2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => {
            setName("");
            setPermission("ingest_write");
            setModalOpen(true);
          }}
        >
          <Plus size={16} aria-hidden />
          Create API key
        </button>
      </div>

      {hasKeys ? (
        <div className={ui.statStrip}>
          <span>
            <strong>{allKeys.length}</strong> keys
          </span>
          <span>
            <strong>{activeCount}</strong> active
          </span>
          <span>
            <strong>{allKeys.length - activeCount}</strong> revoked
          </span>
        </div>
      ) : null}

      {createdSecret ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1.5rem" }}>
          <strong>API key created</strong>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
            Copy this secret now. You won&apos;t be able to see it again.
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "flex-start",
              marginTop: "0.5rem",
            }}
          >
            <pre className={ui.pre} style={{ flex: 1, margin: 0 }}>
              {createdSecret}
            </pre>
            <CopyButton text={createdSecret} iconOnly label="Copy API key secret" />
          </div>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "0.75rem" }}
            onClick={() => setCreatedSecret(null)}
          >
            Done
          </button>
        </div>
      ) : null}

      {keysQuery.isLoading ? <LoadingBlock /> : null}
      {keysQuery.error ? <ErrorAlert message="Failed to load API keys." /> : null}

      {!keysQuery.isLoading && !hasKeys ? (
        <EmptyStatePanel
          icon={KeyRound}
          title="No API keys yet"
          description="API keys authenticate ingest to your org. Agent signing keys (Agents page) sign APS-1 events; use this Bearer token on POST /v1/aegis/events."
          action={
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} aria-hidden />
              Create API key
            </button>
          }
        />
      ) : null}

      {hasKeys ? (
        <>
          <div className={ui.toolbar}>
            <div className={ui.searchWrap}>
              <Search size={16} className={ui.searchIcon} aria-hidden />
              <input
                className={`${ui.input} ${ui.searchInput}`}
                type="search"
                placeholder="Search by name or prefix…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={ui.input}
              value={permFilter}
              onChange={(e) =>
                setPermFilter(e.target.value as "all" | "full" | "read")
              }
              aria-label="Filter by permission"
            >
              <option value="all">All permissions</option>
              <option value="full">Full access</option>
              <option value="read">Read-only</option>
            </select>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={exportCsv}
              title="Download CSV"
            >
              <Download size={16} aria-hidden />
            </button>
          </div>

          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th style={{ width: "2.5rem" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Name</th>
                  <th>Token</th>
                  <th>Permission</th>
                  <th>Last used</th>
                  <th>Created</th>
                  <th style={{ width: "3rem" }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => (
                  <tr key={k.key_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(k.key_id)}
                        onChange={() => toggleOne(k.key_id)}
                        aria-label={`Select ${k.name}`}
                      />
                    </td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          className={ui.statusDot}
                          data-active={k.last_used_at ? "true" : "false"}
                          aria-hidden
                        />
                        {k.name.replace(/\s*\[read-only\]\s*$/i, "")}
                      </span>
                    </td>
                    <td>
                      <code className={ui.tokenPill}>
                        {k.key_prefix}…
                      </code>
                    </td>
                    <td className={ui.muted}>{keyPermissionLabel(k.name)}</td>
                    <td className={ui.muted}>{formatRelativeTime(k.last_used_at)}</td>
                    <td className={ui.muted}>{formatRelativeTime(k.created_at)}</td>
                    <td>
                      {k.active ? (
                        <RowMenu
                          items={[
                            {
                              label: "Edit API key",
                              onClick: () => {
                                setEditKey(k);
                                setName(k.name.replace(/\s*\[read-only\]\s*$/i, ""));
                              },
                            },
                            {
                              label: "Revoke API key",
                              danger: true,
                              onClick: () => {
                                if (confirm(`Revoke key "${k.name}"?`)) {
                                  revokeKey.mutate(k.key_id);
                                }
                              },
                            },
                          ]}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={ui.tableFooter}>
              {filtered.length} of {allKeys.length} keys
            </p>
          </div>
        </>
      ) : null}

      {selected.size > 0 ? (
        <div className={bulkStyles.bar}>
          <span className={bulkStyles.count}>{selected.size} selected</span>
          <button
            type="button"
            className={bulkStyles.clear}
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
          >
            ×
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnDanger}`}
            onClick={() => {
              if (
                confirm(
                  `Revoke ${selected.size} key${selected.size === 1 ? "" : "s"}?`,
                )
              ) {
                for (const id of selected) {
                  revokeKey.mutate(id);
                }
              }
            }}
            disabled={revokeKey.isPending}
          >
            Revoke
          </button>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title="Create API key"
        description="Name your key and choose a permission level. The secret is only shown once after creation."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!createKey.isPending) setModalOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setModalOpen(false)}
              disabled={createKey.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!name.trim() || createKey.isPending}
              onClick={() => {
                const label =
                  permission === "ingest_read"
                    ? `${name.trim()} [read-only]`
                    : name.trim();
                createKey.mutate(label);
              }}
            >
              {createKey.isPending ? "Creating…" : "Add"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Name
          <input
            className={ui.input}
            type="text"
            placeholder="Production"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <fieldset style={{ border: 0, margin: "1.25rem 0 0", padding: 0 }}>
          <legend className={ui.field} style={{ marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
            Permission
          </legend>
          <div className={optionStyles.optionGroup}>
            <label
              className={`${optionStyles.option} ${
                permission === "ingest_write" ? optionStyles.optionActive : ""
              }`}
            >
              <input
                type="radio"
                name="permission"
                checked={permission === "ingest_write"}
                onChange={() => setPermission("ingest_write")}
              />
              <span>
                <span className={optionStyles.optionTitle}>Full access</span>
                <p className={optionStyles.optionDesc}>
                  Post signed events to your organization via the ingest API.
                </p>
              </span>
            </label>
            <label
              className={`${optionStyles.option} ${
                permission === "ingest_read" ? optionStyles.optionActive : ""
              }`}
            >
              <input
                type="radio"
                name="permission"
                checked={permission === "ingest_read"}
                onChange={() => setPermission("ingest_read")}
              />
              <span>
                <span className={optionStyles.optionTitle}>Read-only</span>
                <p className={optionStyles.optionDesc}>
                  Scoped read tokens ship later; name tagged [read-only] for now.
                </p>
              </span>
            </label>
          </div>
        </fieldset>
        {createKey.isError ? (
          <ErrorAlert message={(createKey.error as Error).message} />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editKey)}
        title="Edit API key"
        description="You can rename a key. The secret cannot be changed — create a new key to rotate."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!renameKey.isPending) setEditKey(null);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setEditKey(null)}
              disabled={renameKey.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!name.trim() || renameKey.isPending}
              onClick={() => {
                if (!editKey) return;
                const suffix = editKey.name.includes("[read-only]")
                  ? " [read-only]"
                  : "";
                renameKey.mutate({
                  keyId: editKey.key_id,
                  keyName: `${name.trim()}${suffix}`,
                });
              }}
            >
              {renameKey.isPending ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Name
          <input
            className={ui.input}
            type="text"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
      </Modal>
    </ConsolePage>
  );
}
