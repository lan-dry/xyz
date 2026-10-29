"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ui from "@/components/admin-ui.module.css";
import { HighlightedUpstream } from "@/components/message-privacy";
import { adminCanWrite, siteManagerOnly } from "@/lib/admin-session";
import {
  assignUserSite,
  fetchAdminSites,
  fetchAdminThreadReview,
  fetchAdminUserDetail,
  fetchAdminUserThreads,
  fetchSession,
  type SessionInfo,
} from "@/lib/stoa-client";

const REVIEW_NOTE: Record<"metadata" | "redacted" | "full", string> = {
  metadata: "Message text is hidden by your policy.",
  redacted: "Protected values are shown as placeholders.",
  full: "Full messages, including protected values.",
};

export default function AdminPersonPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const queryClient = useQueryClient();
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
  }, []);

  const siteManager = siteManagerOnly(session);
  const canAssignSite = adminCanWrite(session) || siteManager;

  const detailQuery = useQuery({
    queryKey: ["stoa", "admin", "user", userId],
    queryFn: () => fetchAdminUserDetail(userId),
  });

  const threadsQuery = useQuery({
    queryKey: ["stoa", "admin", "user", userId, "threads"],
    queryFn: () => fetchAdminUserThreads(userId),
    enabled: session !== null && !siteManager,
  });

  const sitesQuery = useQuery({
    queryKey: ["stoa", "admin", "sites"],
    queryFn: fetchAdminSites,
  });

  const threadQuery = useQuery({
    queryKey: ["stoa", "admin", "thread", openThreadId],
    queryFn: () => fetchAdminThreadReview(openThreadId!),
    enabled: Boolean(openThreadId),
  });

  const siteMutation = useMutation({
    mutationFn: (siteId: string | null) => assignUserSite(userId, siteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["stoa", "admin", "user", userId],
      });
      void queryClient.invalidateQueries({ queryKey: ["stoa", "admin", "users"] });
    },
  });

  const detail = detailQuery.data;

  if (detailQuery.isPending) {
    return <p className={ui.metaMuted}>Loading member…</p>;
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className={ui.alertError}>
        {detailQuery.error instanceof Error
          ? detailQuery.error.message
          : "Member not found"}
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/admin/users">Back to Access</Link>
        </p>
      </div>
    );
  }

  const u = detail.user;
  const review = threadQuery.data;

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <p className={ui.metaMuted}>
        <Link href="/admin/users">Access</Link> / Member
      </p>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>{u.displayName ?? u.email}</h1>
        {!siteManager ? (
          <p className={ui.pageSubtitle}>
            Opening a conversation is recorded in the audit log.
          </p>
        ) : null}
      </header>

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Email</p>
          <p className={ui.cardValue} style={{ fontSize: "1rem" }}>
            {u.email}
          </p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Conversations</p>
          <p className={ui.cardValue}>{u.threadCount}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Messages (all time)</p>
          <p className={ui.cardValue}>{u.messageCount}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Messages this month</p>
          <p className={ui.cardValue}>{u.monthMessages}</p>
        </div>
      </div>

      <div className={ui.card} style={{ marginBottom: "1.25rem" }}>
        <label className={ui.field} style={{ marginBottom: 0 }}>
          Site
          <select
            value={u.siteId ?? ""}
            disabled={
              !canAssignSite || siteMutation.isPending || sitesQuery.isPending
            }
            onChange={(e) => {
              const v = e.target.value;
              siteMutation.mutate(v ? v : null);
            }}
          >
            <option value="">Unassigned</option>
            {(sitesQuery.data?.sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {siteMutation.isError ? (
          <p className={ui.alertError} style={{ marginTop: "0.75rem" }}>
            {siteMutation.error instanceof Error
              ? siteMutation.error.message
              : "Update failed"}
          </p>
        ) : null}
      </div>

      {siteManager ? null : (
        <>
          <h2 className={ui.sectionTitle}>Conversations</h2>
          {threadsQuery.isPending ? (
            <p className={ui.metaMuted}>Loading conversations…</p>
          ) : threadsQuery.isError ? (
            <div className={ui.alertError}>{threadsQuery.error.message}</div>
          ) : (threadsQuery.data?.threads.length ?? 0) === 0 ? (
            <p className={ui.metaMuted}>No conversations yet.</p>
          ) : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Model</th>
                    <th>Messages</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {threadsQuery.data!.threads.map((t) => (
                    <tr key={t.id}>
                      <td>{t.title || "Untitled"}</td>
                      <td className={ui.mono}>{t.modelId}</td>
                      <td>{t.messageCount}</td>
                      <td className={ui.metaMuted}>
                        {new Date(t.updatedAt).toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() =>
                            setOpenThreadId(openThreadId === t.id ? null : t.id)
                          }
                        >
                          {openThreadId === t.id ? "Close" : "Open"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {openThreadId && threadQuery.isPending ? (
        <p className={ui.metaMuted} style={{ marginTop: "1rem" }}>
          Loading conversation…
        </p>
      ) : null}

      {openThreadId && review ? (
        <div className={ui.card} style={{ marginTop: "1.25rem" }}>
          <h2 className={ui.sectionTitle} style={{ marginTop: 0 }}>
            {review.thread.title || "Conversation"}
          </h2>
          <p className={ui.metaMuted}>{REVIEW_NOTE[review.contentAccess]}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {review.messages.map((m) => (
              <li
                key={m.id}
                style={{
                  borderTop: "1px solid var(--console-border)",
                  padding: "0.75rem 0",
                }}
              >
                <p className={ui.metaMuted}>
                  <strong>{m.role === "user" ? "Member" : "Assistant"}</strong>
                  {" · "}
                  {new Date(m.createdAt).toLocaleString()}
                  {review.contentAccess !== "metadata" &&
                  m.role === "user" &&
                  m.redactionManifest?.length
                    ? ` · Withheld: ${m.redactionManifest
                        .map((e) => `${e.label} (${e.count})`)
                        .join(", ")}`
                    : null}
                </p>
                {m.content ? (
                  <pre
                    className={ui.pre}
                    style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}
                  >
                    {review.contentAccess === "full" ? (
                      m.content
                    ) : (
                      <HighlightedUpstream text={m.content} />
                    )}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {threadQuery.isError ? (
        <div className={ui.alertError} style={{ marginTop: "1rem" }}>
          {threadQuery.error instanceof Error
            ? threadQuery.error.message
            : "Could not load conversation"}
        </div>
      ) : null}
    </div>
  );
}
