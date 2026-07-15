"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, EllipsisVertical, LockKeyhole } from "lucide-react";

import { Button } from "@/components/console/button";
import { OPEN_CREATE_API_KEY_EVENT } from "@/components/console/create-api-key-button";
import {
  ConsoleDataTable,
  ConsoleTableHead,
  ConsoleTableRow,
  ConsoleTd,
  ConsoleTh,
} from "@/components/console/console-data-table";
import { ConsoleEmptyState } from "@/components/console/console-empty-state";
import { formatDateTime } from "@/lib/format-datetime";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function ApiKeysPanel({ initialKeys, canManage }: { initialKeys: ApiKeyRow[]; canManage: boolean }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [query, setQuery] = useState("");
  const [permissionFilter, setPermissionFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const filteredKeys = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return keys;
    return keys.filter(
      (key) => key.name.toLowerCase().includes(normalized) || key.prefix.toLowerCase().includes(normalized),
    );
  }, [keys, query]);

  useEffect(() => {
    function openDialog() {
      setDialogOpen(true);
    }
    function syncDialogFromHash() {
      setDialogOpen(window.location.hash === "#create-api-key");
    }
    syncDialogFromHash();
    window.addEventListener("hashchange", syncDialogFromHash);
    window.addEventListener(OPEN_CREATE_API_KEY_EVENT, openDialog);
    return () => {
      window.removeEventListener("hashchange", syncDialogFromHash);
      window.removeEventListener(OPEN_CREATE_API_KEY_EVENT, openDialog);
    };
  }, []);

  const selectedCount = selectedIds.length;
  const allVisibleSelected =
    filteredKeys.length > 0 && filteredKeys.every((key) => selectedIds.includes(key.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredKeys.some((key) => key.id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...filteredKeys.map((key) => key.id)])]);
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function revokeSelected() {
    if (!canManage || selectedIds.length === 0) return;
    startTransition(async () => {
      await Promise.all(
        selectedIds.map((id) => fetch(`/api/console/api-keys/${id}/revoke`, { method: "POST" })),
      );
      setKeys((prev) => prev.filter((row) => !selectedIds.includes(row.id)));
      setSelectedIds([]);
      router.refresh();
    });
  }

  function createKey() {
    startTransition(async () => {
      const res = await fetch("/api/console/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "Default key" }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as ApiKeyRow & { secret: string };
      setNewSecret(data.secret);
      setKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          prefix: data.prefix,
          createdAt: data.createdAt,
          lastUsedAt: null,
        },
        ...prev,
      ]);
      setName(data.name);
      router.refresh();
    });
  }

  async function copySecret() {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      setSecretCopied(false);
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setName("");
    setNewSecret(null);
    setSecretCopied(false);
    if (window.location.hash === "#create-api-key") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  return (
    <div className="space-y-6">
      <div className="console-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search keys"
          className="console-input w-full max-w-sm"
        />
        <select
          className="console-select"
          value={permissionFilter}
          onChange={(event) => setPermissionFilter(event.target.value)}
        >
          <option value="all">All permissions</option>
          <option value="organization">Organization</option>
        </select>
      </div>

      {!canManage ? (
        <p className="text-sm text-[var(--console-fg-subtle)]">Your role cannot create API keys (developer or higher).</p>
      ) : null}

      {keys.length === 0 ? (
        <ConsoleEmptyState
          title="No API keys yet"
          description="Create an API key to authenticate ingest requests for this organization."
        />
      ) : (
        <ConsoleDataTable>
          <ConsoleTableHead>
            <tr>
              {canManage ? (
                <ConsoleTh className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all keys"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="console-checkbox"
                  />
                </ConsoleTh>
              ) : null}
              <ConsoleTh>Name</ConsoleTh>
              <ConsoleTh>Token</ConsoleTh>
              <ConsoleTh>Permission</ConsoleTh>
              <ConsoleTh>Last used</ConsoleTh>
              <ConsoleTh className="text-right">Created</ConsoleTh>
              {canManage ? <ConsoleTh className="w-16"> </ConsoleTh> : null}
            </tr>
          </ConsoleTableHead>
          <tbody>
            {filteredKeys.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 5} className="px-4 py-10 text-center text-[var(--console-fg-subtle)]">
                  No keys match your search.
                </td>
              </tr>
            ) : (
              filteredKeys.map((key) => (
                <ConsoleTableRow key={key.id}>
                  {canManage ? (
                    <ConsoleTd>
                      <input
                        type="checkbox"
                        aria-label={`Select ${key.name}`}
                        checked={selectedIds.includes(key.id)}
                        onChange={() => toggleRow(key.id)}
                        className="console-checkbox"
                      />
                    </ConsoleTd>
                  ) : null}
                  <ConsoleTd>
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-soft/35 text-teal-deep">
                        <LockKeyhole className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium tracking-tight text-[var(--console-fg)]">{key.name}</span>
                    </span>
                  </ConsoleTd>
                  <ConsoleTd>
                    <span className="console-token-badge">{key.prefix}…</span>
                  </ConsoleTd>
                  <ConsoleTd className="text-[var(--console-fg-subtle)]">Organization</ConsoleTd>
                  <ConsoleTd className="text-[var(--console-fg-subtle)]">
                    {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "Never"}
                  </ConsoleTd>
                  <ConsoleTd className="text-right text-[var(--console-fg-subtle)]">{formatDateTime(key.createdAt)}</ConsoleTd>
                  {canManage ? (
                    <ConsoleTd className="text-right">
                      <details className="relative inline-block text-left">
                        <summary className="list-none rounded-md p-1 text-[var(--console-fg-subtle)] transition-colors duration-150 hover:bg-[var(--console-surface-hover)] hover:text-[var(--console-fg)]">
                          <EllipsisVertical className="h-4 w-4" />
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 min-w-28 rounded-lg border border-[var(--console-border)] bg-[var(--console-surface)] p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-red-800 transition-colors duration-150 hover:bg-red-50"
                            disabled={pending}
                            onClick={() => {
                              startTransition(async () => {
                                await fetch(`/api/console/api-keys/${key.id}/revoke`, { method: "POST" });
                                setKeys((prev) => prev.filter((row) => row.id !== key.id));
                                router.refresh();
                              });
                            }}
                          >
                            Revoke
                          </button>
                        </div>
                      </details>
                    </ConsoleTd>
                  ) : null}
                </ConsoleTableRow>
              ))
            )}
          </tbody>
        </ConsoleDataTable>
      )}
      {keys.length > 0 ? (
        <p className="text-sm text-[var(--console-fg-subtle)]">Page 1 - 1 of {keys.length} keys</p>
      ) : null}

      {canManage && selectedCount > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--console-border)] bg-[var(--console-surface)] px-4 py-2 shadow-lg">
          <span className="text-sm font-medium text-[var(--console-fg)]">
            {selectedCount} selected
          </span>
          <button
            type="button"
            className="text-sm text-[var(--console-fg-subtle)] no-underline hover:text-[var(--console-fg)]"
            onClick={clearSelection}
          >
            Clear
          </button>
          <Button type="button" variant="secondary" disabled={pending} onClick={revokeSelected}>
            Delete
          </Button>
        </div>
      ) : null}

      {dialogOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-5 shadow-xl">
            <h3 className="text-lg font-semibold tracking-tight text-[var(--console-fg)]">Create API key</h3>
            {!newSecret ? (
              <>
                <p className="mt-1 text-sm text-[var(--console-fg-subtle)]">Keys are shown once at creation. Store it securely.</p>
                <form
                  className="mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createKey();
                  }}
                >
                  <label className="block text-sm text-[var(--console-fg-muted)]">
                    Key name
                    <input
                      className="console-input mt-1 w-full"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Production ingest"
                    />
                  </label>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={closeDialog}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      Create key
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="console-alert-warning mt-3 rounded-lg px-4 py-3 text-sm">
                  <p className="font-medium">Copy your API key now — it will not be shown again.</p>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="block min-w-0 flex-1 break-all rounded bg-white/80 px-2 py-1 font-mono text-xs">
                      {newSecret}
                    </code>
                    <button
                      type="button"
                      aria-label={secretCopied ? "Copied" : "Copy API key"}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300/80 bg-white/90 px-2 py-1.5 text-xs font-medium text-amber-950 transition-colors duration-150 hover:bg-white"
                      onClick={() => void copySecret()}
                    >
                      {secretCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {secretCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={closeDialog}>
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
