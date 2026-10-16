"use client";

import Link from "next/link";
import { useState } from "react";

import { IdApiError, idApi } from "@/lib/id-api";

import styles from "../login/login.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi<{ ok: boolean }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof IdApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <h1>Reset password</h1>
        <p className={styles.sub}>We&apos;ll email you a reset link.</p>

        {sent ? (
          <div className={styles.success} role="status">
            <strong>Check your inbox</strong>
            If an account exists, a reset link was sent. Links expire after one
            hour.
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className={styles.field}>
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className={styles.footerLinks}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
