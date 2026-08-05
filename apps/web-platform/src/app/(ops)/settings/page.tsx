"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";

import { PasswordField } from "@/components/auth/password-field";
import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";
import { ErrorAlert, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { idApi } from "@/lib/id-api";
import { platformRoleLabel } from "@/lib/platform-permissions";

type MePayload = {
  account: {
    email: string;
    display_name: string | null;
    platform_role: string | null;
  };
};

export default function OpsSettingsPage() {
  const { email, logout, platformRole, accountId } = usePlatformSession();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MePayload>("/auth/me"),
  });

  const [displayName, setDisplayName] = useState("");
  const [nameReady, setNameReady] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (meQuery.data && !nameReady) {
      setDisplayName(meQuery.data.account.display_name ?? "");
      setNameReady(true);
    }
  }, [meQuery.data, nameReady]);

  const saveProfile = useMutation({
    mutationFn: () =>
      idApi("/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName.trim() || null }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["id", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "session"] });
    },
  });

  const changePassword = useMutation({
    mutationFn: () =>
      idApi("/account/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: nextPassword,
        }),
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    },
  });

  return (
    <OpsShell
      title="Your profile"
      subtitle="Update how you appear in Ops and change your Salanor ID password."
      staffEmail={email}
      onLogout={logout}
    >
      <section className={card.settingCard}>
        <h2>Identity</h2>
        <p>
          Email is your Salanor login across Console and Ops. Platform role:{" "}
          <strong>{platformRoleLabel(platformRole)}</strong>
          {accountId ? (
            <>
              {" "}
              ·{" "}
              <Link href={`/accounts/${accountId}`} className={ui.tableLink}>
                View account record
              </Link>
            </>
          ) : null}
        </p>
        <label className={ui.field} style={{ maxWidth: "28rem" }}>
          Email
          <input className={ui.input} value={email} disabled />
        </label>
        <form
          className={ui.formRow}
          style={{ marginTop: "1rem", maxWidth: "36rem", alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            saveProfile.mutate();
          }}
        >
          <label className={ui.field} style={{ flex: 1, minWidth: "14rem" }}>
            Display name
            <input
              className={ui.input}
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
          <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
            Profile updated.
          </p>
        ) : null}
      </section>

      <section className={card.settingCard}>
        <h2>Password</h2>
        <p>Change the password for your Salanor account (Console and Ops share this login).</p>
        <form
          className={ui.formGrid}
          style={{ maxWidth: "24rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (nextPassword !== confirmPassword) return;
            changePassword.mutate();
          }}
        >
          <PasswordField
            label="Current password"
            fieldClassName={ui.field}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            fieldClassName={ui.field}
            value={nextPassword}
            onChange={(e) => setNextPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            fieldClassName={ui.field}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
          />
          {nextPassword && confirmPassword && nextPassword !== confirmPassword ? (
            <p style={{ color: "var(--console-danger)", fontSize: "0.8125rem", margin: 0 }}>
              Passwords do not match.
            </p>
          ) : null}
          {changePassword.isError ? (
            <ErrorAlert message={(changePassword.error as Error).message} />
          ) : null}
          {changePassword.isSuccess ? (
            <p style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)", margin: 0 }}>
              Password updated.
            </p>
          ) : null}
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={
              changePassword.isPending ||
              !currentPassword ||
              nextPassword.length < 10 ||
              nextPassword !== confirmPassword
            }
          >
            {changePassword.isPending ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>

      <section className={card.settingCard}>
        <h2>
          <Shield size={16} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />
          Platform access
        </h2>
        <p>
          Customer org invites live in the Aegis Console (Members). To grant Ops access to another
          Salanor employee, use{" "}
          <Link href="/team" className={ui.tableLink}>
            Platform team
          </Link>
          .
        </p>
      </section>
    </OpsShell>
  );
}
