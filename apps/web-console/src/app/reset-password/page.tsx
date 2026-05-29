"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { idApi } from "@/lib/id-api";

import styles from "../login/login.module.css";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function AuthPageFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    </div>
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
      setError("Password must be at least 10 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Missing reset token in URL");
      return;
    }
    setLoading(true);
    try {
      await idApi<{ ok: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.replace("/login?return=/aegis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Set a new password"
        description="Choose a strong password (10+ characters). You will be redirected to sign in when the update succeeds."
      />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Choose a new password</h2>
          {!token ? (
            <p className={styles.error} style={{ marginBottom: "1rem" }}>
              This link is invalid or incomplete. Request a new reset from the sign-in page.
            </p>
          ) : null}
          <form onSubmit={onSubmit}>
            <label className={styles.field}>
              <span>New password</span>
              <input
                className={styles.input}
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
              <span>Confirm password</span>
              <input
                className={styles.input}
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
              className={styles.submit}
              disabled={loading || !token}
            >
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
          <p className={styles.footer}>
            <Link href="/forgot-password" className={styles.footerLink}>
              Request a new link
            </Link>
            {" · "}
            <Link href="/login" className={styles.footerLink}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
