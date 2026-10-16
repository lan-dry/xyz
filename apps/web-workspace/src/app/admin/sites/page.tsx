"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminEmptyValue } from "@/components/admin-empty-value";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import { adminCanWrite } from "@/lib/admin-session";
import {
  createAdminSite,
  fetchAdminSites,
  fetchSession,
  type SessionInfo,
} from "@/lib/stoa-client";

export default function AdminSitesPage() {
  const queryClient = useQueryClient();
  const [siteName, setSiteName] = useState("");
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const canWrite = adminCanWrite(session);

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
  }, []);

  const sitesQuery = useQuery({
    queryKey: ["stoa", "admin", "sites"],
    queryFn: fetchAdminSites,
  });

  const createSite = useMutation({
    mutationFn: () => createAdminSite({ name: siteName.trim() }),
    onSuccess: () => {
      setSiteName("");
      void queryClient.invalidateQueries({ queryKey: ["stoa", "admin", "sites"] });
    },
  });

  const sites = sitesQuery.data?.sites ?? [];
  const showDirectoryGroup = sites.some((s) => s.directoryGroupExternalId);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return sites;
    }
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.directoryGroupExternalId?.toLowerCase().includes(q) ?? false),
    );
  }, [sites, search]);

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Sites</h1>
        <p className={ui.pageSubtitle}>
          Branches and departments, for grouping members and reports.
        </p>
      </header>

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Sites</p>
          <p className={ui.cardValue}>{sites.length}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Members assigned</p>
          <p className={ui.cardValue}>
            {sites.reduce((n, s) => n + s.memberCount, 0)}
          </p>
        </div>
      </div>

      {canWrite ? (
        <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
          <div className={ui.filterBar} style={{ marginBottom: 0 }}>
            <div className={ui.filterField} style={{ gridColumn: "1 / -1" }}>
              <span className={ui.filterLabel}>Add site</span>
              <div className={ui.searchWithBtn}>
                <input
                  className={ui.filterControl}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="e.g. Kigali HQ"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && siteName.trim()) {
                      createSite.mutate();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnPrimary}`}
                  disabled={!siteName.trim() || createSite.isPending}
                  onClick={() => createSite.mutate()}
                >
                  Add site
                </button>
              </div>
            </div>
          </div>
          {createSite.isError ? (
            <p className={ui.alertError} style={{ marginTop: "0.75rem" }}>
              {createSite.error instanceof Error
                ? createSite.error.message
                : "Could not create site"}
            </p>
          ) : null}
        </div>
      ) : null}

      {sitesQuery.isPending ? (
        <p className={ui.metaMuted}>Loading sites…</p>
      ) : sitesQuery.isError ? (
        <div className={ui.alertError}>
          {sitesQuery.error instanceof Error
            ? sitesQuery.error.message
            : "Could not load sites"}
        </div>
      ) : sites.length === 0 ? (
        <EmptyStatePanel
          icon={Building2}
          title="No sites yet"
          description={canWrite ? "Add a branch or department." : undefined}
        />
      ) : (
        <>
          <div className={ui.filterBar}>
            <div className={ui.filterField} style={{ gridColumn: "1 / -1" }}>
              <span className={ui.filterLabel}>Filter sites</span>
              <div className={ui.searchWithBtn}>
                <input
                  type="search"
                  className={ui.filterControl}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sites"
                />
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() => setSearch("")}
                  disabled={!search.trim()}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <p className={ui.listSummary}>
            Showing {filtered.length} of {sites.length} sites
          </p>
          {filtered.length === 0 ? (
            <p className={ui.metaMuted}>No sites match your filter.</p>
          ) : (
            <div className={`${ui.tableWrap} ${ui.tableScroll}`}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    {showDirectoryGroup ? <th>Directory group</th> : null}
                    <th>Members</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/admin/sites/${s.id}`}>{s.name}</Link>
                        {s.description ? (
                          <p className={ui.metaMuted} style={{ margin: "0.2rem 0 0" }}>
                            {s.description}
                          </p>
                        ) : null}
                      </td>
                      {showDirectoryGroup ? (
                        <td>
                          {s.directoryGroupExternalId ? (
                            <span className={ui.mono}>
                              {s.directoryGroupExternalId}
                            </span>
                          ) : (
                            <AdminEmptyValue>Not linked</AdminEmptyValue>
                          )}
                        </td>
                      ) : null}
                      <td>{s.memberCount}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/admin/sites/${s.id}`}
                          className={`${ui.btn} ${ui.btnSecondary}`}
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
