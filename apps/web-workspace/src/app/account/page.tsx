"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { IdApiError, idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/id-types";

import styles from "../login/login.module.css";

export default function AccountSecurityPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    idApi<MeResponse>("/auth/me")
      .then(setMe)
      .catch(() => router.replace("/login?return=/account"));
  }, [router]);

  const hasPassword = me?.account.has_password === true;

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await idApi("/account/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setMessage("Password updated.");
    } catch (err) {
      setError(err instanceof IdApiError ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  if (!me) {
    return <p className={styles.loading}>Loading account…</p>;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <h1>Account</h1>
        <p className={styles.sub}>
          Signed in as <strong>{me.account.email}</strong>
          {me.organization ? ` · ${me.organization.name}` : null}
        </p>

        {hasPassword ? (
          <>
            <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.75rem" }}>
              Change password
            </h2>
            <form onSubmit={onChangePassword}>
              <label className={styles.field}>
                Current password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className={styles.field}>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </label>
              <label className={styles.field}>
                Confirm new password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </label>
              {error ? <p className={styles.error}>{error}</p> : null}
              {message ? <div className={styles.success}>{message}</div> : null}
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        ) : (
          <p className={styles.hint}>
            This account signs in with SSO and has no local password. Password
            changes are managed by your identity provider.
          </p>
        )}

        <p className={styles.footerLinks}>
          <Link href="/">← Back to workspace</Link>
          {!hasPassword ? null : (
            <>
              {" · "}
              <Link href="/forgot-password">Forgot password?</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
