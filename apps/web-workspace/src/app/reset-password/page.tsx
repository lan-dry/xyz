"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { IdApiError, idApi } from "@/lib/id-api";

import styles from "../login/login.module.css";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      await idApi<{ ok: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.replace("/login?return=/");
    } catch (err) {
      setError(err instanceof IdApiError ? err.message : "Couldn't update your password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <h1>Choose a new password</h1>
        <p className={styles.sub}>At least 10 characters.</p>
        {!token ? (
          <p className={styles.error}>
            This link is incomplete. Request a new one.
          </p>
        ) : null}
        <form onSubmit={onSubmit}>
          <label className={styles.field}>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
              disabled={!token}
            />
          </label>
          <label className={styles.field}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              disabled={!token}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !token}
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
        <p className={styles.footerLinks}>
          <Link href="/forgot-password">Request a new link</Link>
          {" · "}
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
