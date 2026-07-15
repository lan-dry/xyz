"use client";

import Link from "next/link";
import { useState } from "react";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { idApi } from "@/lib/id-api";

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
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Account recovery"
        description="Reset access to the Salanor console. Reset links expire in one hour."
      />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Reset password</h2>
          <p className={styles.cardSub}>
            Enter the work email on your Salanor account. We never confirm whether an address
            exists — you will only receive a link if it does.
          </p>

          {sent ? (
            <div className={styles.success} role="status">
              <strong>Check your inbox</strong>
              <p>
                If an account exists for that email, a reset link was sent. Check your inbox and
                spam folder.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <label className={styles.field}>
                <span>Work email</span>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </label>
              {error ? <p className={styles.error}>{error}</p> : null}
              <button type="submit" className={styles.submit} disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className={styles.footer}>
            <Link href="/login" className={styles.footerLink}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
