"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

import settings from "../settings.module.css";

type Invite = {
  invite_id: string;
  email: string;
  expires_at: string;
  active: boolean;
};

export default function AuditorsSettingsPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["console", "auditor-invites"],
    queryFn: () => consoleApi<{ invites: Invite[] }>("/auditor/invites"),
  });

  const createInvite = useMutation({
    mutationFn: () =>
      consoleApi<{ invite: { portal_url: string; email: string } }>(
        "/auditor/invites",
        {
          method: "POST",
          body: JSON.stringify({ email, days: 14 }),
        },
      ),
    onSuccess: (data) => {
      setCreatedUrl(data.invite.portal_url);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["console", "auditor-invites"] });
    },
  });

  return (
    <section className={settings.settingCard}>
      <h2>Auditor invites</h2>
      <p className={settings.settingsRowHint}>
        Scoped read-only portal for external reviewers. Access is logged. Share the
        portal link once; it is not shown again after you leave this page.
      </p>

      <label className={ui.field} style={{ marginTop: "1rem" }}>
        Email
        <input
          className={ui.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="auditor@firm.example"
        />
      </label>
      <button
        type="button"
        className={`${ui.btn} ${ui.btnPrimary}`}
        style={{ marginTop: "0.75rem" }}
        disabled={!email.trim() || createInvite.isPending}
        onClick={() => createInvite.mutate()}
      >
        Create invite
      </button>
      {createInvite.isError ? (
        <ErrorAlert
          message={
            createInvite.error instanceof Error
              ? createInvite.error.message
              : "Could not create invite"
          }
        />
      ) : null}
      {createdUrl ? (
        <p className={ui.cardHint} style={{ marginTop: "0.75rem" }}>
          Portal link (copy now):{" "}
          <code className="mono" style={{ fontSize: "0.75rem" }}>
            {createdUrl}
          </code>
        </p>
      ) : null}

      <div className={ui.tableWrap} style={{ marginTop: "1.25rem" }}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(listQuery.data?.invites ?? []).map((inv) => (
              <tr key={inv.invite_id}>
                <td>{inv.email}</td>
                <td>{new Date(inv.expires_at).toLocaleString()}</td>
                <td>{inv.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
