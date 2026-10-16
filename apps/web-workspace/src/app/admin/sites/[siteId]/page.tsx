"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminEmptyValue } from "@/components/admin-empty-value";
import ui from "@/components/admin-ui.module.css";
import { adminCanWrite } from "@/lib/admin-session";
import {
  addAdminSiteManager,
  deleteAdminSite,
  fetchAdminSiteManagers,
  fetchAdminSiteDetail,
  fetchAdminSiteMembers,
  fetchAdminUsers,
  fetchSession,
  removeAdminSiteManager,
  updateAdminSite,
  type AdminSiteManager,
  type SessionInfo,
} from "@/lib/stoa-client";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminSiteDetailPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [directoryGroupExternalId, setDirectoryGroupExternalId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminSiteManager | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [managerPick, setManagerPick] = useState("");
  const canWrite = adminCanWrite(session);
  const managersKey = ["stoa", "admin", "site", siteId, "managers"];

  const detailQuery = useQuery({
    queryKey: ["stoa", "admin", "site", siteId],
    queryFn: () => fetchAdminSiteDetail(siteId),
  });

  const membersQuery = useQuery({
    queryKey: ["stoa", "admin", "site", siteId, "members"],
    queryFn: () => fetchAdminSiteMembers(siteId),
  });

  const managersQuery = useQuery({
    queryKey: managersKey,
    queryFn: () => fetchAdminSiteManagers(siteId),
  });

  const stoaUsersQuery = useQuery({
    queryKey: ["stoa", "admin", "users"],
    queryFn: fetchAdminUsers,
    enabled: canWrite,
  });

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
  }, []);

  const site = detailQuery.data?.site;
  const managers = managersQuery.data?.managers ?? [];

  const managerCandidates = useMemo(() => {
    const managerIds = new Set(managers.map((m) => m.stoaUserId));
    return (stoaUsersQuery.data?.users ?? []).filter((u) => !managerIds.has(u.id));
  }, [managers, stoaUsersQuery.data?.users]);

  useEffect(() => {
    if (site) {
      setName(site.name);
      setDescription(site.description ?? "");
      setDirectoryGroupExternalId(site.directoryGroupExternalId ?? "");
    }
  }, [site]);

  const save = useMutation({
    mutationFn: () =>
      updateAdminSite(siteId, {
        name: name.trim(),
        description: description.trim() || null,
        directoryGroupExternalId: directoryGroupExternalId.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["stoa", "admin", "site", siteId],
      });
      void queryClient.invalidateQueries({ queryKey: ["stoa", "admin", "sites"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteAdminSite(siteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stoa", "admin", "sites"] });
      router.push("/admin/sites");
    },
  });

  const addManager = useMutation({
    mutationFn: (stoaUserId: string) => addAdminSiteManager(siteId, stoaUserId),
    onSuccess: () => {
      setManagerPick("");
      void queryClient.invalidateQueries({ queryKey: managersKey });
    },
  });

  const removeManager = useMutation({
    mutationFn: (stoaUserId: string) => removeAdminSiteManager(siteId, stoaUserId),
    onSuccess: () => {
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: managersKey });
    },
  });

  if (detailQuery.isPending) {
    return <p className={ui.metaMuted}>Loading site…</p>;
  }

  if (detailQuery.isError || !site) {
    return (
      <div className={ui.alertError}>
        {errorText(detailQuery.error, "Site not found")}
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/admin/sites">Back to Sites</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <p className={ui.metaMuted}>
        <Link href="/admin/sites">Sites</Link> / {site.name}
      </p>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>{site.name}</h1>
      </header>

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Members</p>
          <p className={ui.cardValue}>{site.memberCount}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Conversations</p>
          <p className={ui.cardValue}>{site.threadCount}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Messages</p>
          <p className={ui.cardValue}>{site.messageCount}</p>
        </div>
      </div>

      <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Site settings
        </h2>
        <label className={ui.field}>
          Display name
          <input
            value={name}
            disabled={!canWrite}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={ui.field}>
          Description
          <input
            value={description}
            disabled={!canWrite}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note for admins"
          />
        </label>
        <label className={ui.field}>
          Directory group (optional)
          <input
            className={ui.mono}
            value={directoryGroupExternalId}
            disabled={!canWrite}
            onChange={(e) => setDirectoryGroupExternalId(e.target.value)}
          />
        </label>
        <div className={ui.toolbar}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={!canWrite || !name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save site"}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={!canWrite}
            onClick={() => {
              remove.reset();
              setConfirmDelete(true);
            }}
          >
            Delete site
          </button>
        </div>
        {save.isError ? (
          <p className={ui.alertError}>{errorText(save.error, "Save failed")}</p>
        ) : null}
      </div>

      <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
        <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
          Site managers
        </h2>
        <p className={ui.metaMuted}>Managers can see this site and its members.</p>
        {managersQuery.isPending ? (
          <p className={ui.metaMuted}>Loading managers…</p>
        ) : managersQuery.isError ? (
          <p className={ui.alertError}>
            {errorText(managersQuery.error, "Could not load managers")}
          </p>
        ) : managers.length === 0 ? (
          <p className={ui.metaMuted}>No managers</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.stoaUserId}>
                    <td>
                      {m.displayName ? (
                        <>
                          {m.displayName}
                          <br />
                          <span className={ui.metaMuted}>{m.email}</span>
                        </>
                      ) : (
                        m.email
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {canWrite ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() => {
                            removeManager.reset();
                            setRemoveTarget(m);
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite ? (
          <div className={ui.toolbar} style={{ marginTop: "0.75rem" }}>
            <select
              value={managerPick}
              onChange={(e) => setManagerPick(e.target.value)}
              aria-label="Add site manager"
            >
              <option value="">Choose a person</option>
              {managerCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ? `${u.displayName} (${u.email})` : u.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!managerPick || addManager.isPending}
              onClick={() => addManager.mutate(managerPick)}
            >
              {addManager.isPending ? "Adding…" : "Add manager"}
            </button>
          </div>
        ) : null}
        {addManager.isError ? (
          <p className={ui.alertError} style={{ marginTop: "0.75rem" }}>
            {errorText(addManager.error, "Could not add manager")}
          </p>
        ) : null}
      </div>

      <h2 className={ui.sectionTitle}>Members at this site</h2>
      {membersQuery.isPending ? (
        <p className={ui.metaMuted}>Loading members…</p>
      ) : membersQuery.isError ? (
        <p className={ui.alertError}>
          {errorText(membersQuery.error, "Could not load members")}
        </p>
      ) : (membersQuery.data?.members.length ?? 0) === 0 ? (
        <p className={ui.metaMuted}>No members yet.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Conversations</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {membersQuery.data!.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td>
                    {m.displayName ? (
                      m.displayName
                    ) : (
                      <AdminEmptyValue>Not set</AdminEmptyValue>
                    )}
                  </td>
                  <td>{m.threadCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link
                      href={`/admin/people/${m.id}`}
                      className={`${ui.btn} ${ui.btnSecondary}`}
                    >
                      Profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Delete site</h2>
            <p className={ui.modalDesc}>
              Delete {site.name}? Members will be unassigned. This can&apos;t be
              undone.
            </p>
            {remove.isError ? (
              <p className={ui.alertError}>
                {errorText(remove.error, "Could not delete site")}
              </p>
            ) : null}
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? "Deleting…" : "Delete site"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Remove manager</h2>
            <p className={ui.modalDesc}>
              Remove {removeTarget.displayName ?? removeTarget.email} as a manager
              of {site.name}?
            </p>
            {removeManager.isError ? (
              <p className={ui.alertError}>
                {errorText(removeManager.error, "Could not remove manager")}
              </p>
            ) : null}
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setRemoveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={removeManager.isPending}
                onClick={() => removeManager.mutate(removeTarget.stoaUserId)}
              >
                {removeManager.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
