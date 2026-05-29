"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

import settings from "../settings.module.css";

type MembershipRow = {
  membership_id: string;
  organization_name: string;
  organization_slug: string;
  role: string;
  joined_at: string;
  is_active: boolean;
};

export default function ProfileSettingsPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const teamsQuery = useQuery({
    queryKey: ["id", "memberships"],
    queryFn: () =>
      idApi<{ memberships: MembershipRow[] }>("/account/memberships"),
  });

  const [displayName, setDisplayName] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (meQuery.data && !initialized) {
      setDisplayName(meQuery.data.account.display_name ?? "");
      setInitialized(true);
    }
  }, [meQuery.data, initialized]);

  const saveProfile = useMutation({
    mutationFn: () =>
      idApi<MeResponse>("/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName.trim() || null }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["id"] });
    },
  });

  const email = meQuery.data?.account.email ?? "";

  return (
    <>
      <section className={settings.settingCard}>
        <h2>Your email</h2>
        <p>Email is your global Salanor identity across all organizations.</p>
        <label className={ui.field}>
          Email address
          <input className={ui.input} type="email" value={email} disabled />
        </label>
        <p className={ui.muted} style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
          Contact your organization admin to change your login email.
        </p>
      </section>

      <section className={settings.settingCard}>
        <h2>Display name</h2>
        <p>Shown to teammates in the console and audit logs.</p>
        <form
          className={ui.formRow}
          onSubmit={(e) => {
            e.preventDefault();
            saveProfile.mutate();
          }}
        >
          <label className={ui.field} style={{ flex: 1, minWidth: "14rem" }}>
            Name
            <input
              className={ui.input}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </label>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={saveProfile.isPending}
          >
            {saveProfile.isPending ? "Saving…" : "Update profile"}
          </button>
        </form>
        {saveProfile.isError ? (
          <ErrorAlert message={(saveProfile.error as Error).message} />
        ) : null}
        {saveProfile.isSuccess ? (
          <p className={ui.muted} style={{ marginTop: "0.5rem" }}>
            Profile updated.
          </p>
        ) : null}
      </section>

      <section className={settings.settingCard}>
        <h2>Organizations</h2>
        <p>Teams associated with your account. Switch org from the header dropdown.</p>
        {teamsQuery.data?.memberships.map((m) => (
          <div key={m.membership_id} className={settings.teamRow}>
            <div className={settings.teamMeta}>
              <span className={settings.teamIcon}>
                {m.organization_name.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>{m.organization_name}</strong>
                <br />
                <span className={ui.muted} style={{ fontSize: "0.75rem" }}>
                  Joined {new Date(m.joined_at).toLocaleDateString()} · {m.role}
                  {m.is_active ? " · current" : ""}
                </span>
              </span>
            </div>
            <span className={`${ui.badge} ${ui.badgeMuted}`}>{m.role}</span>
          </div>
        ))}
      </section>
    </>
  );
}
