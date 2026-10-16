"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { IdApiError, idApi } from "@/lib/id-api";

import styles from "./login.module.css";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return") ?? "/";
  const emailParam = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    idApi<{ user?: { email: string } }>("/auth/me")
      .then((data) => {
        if (data.user?.email) {
          router.replace(returnTo);
        }
      })
      .catch(() => {});
  }, [returnTo, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof IdApiError ? err.message : "Sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <h1>Stoa</h1>
        <p className={styles.sub}>Sign in with your work email.</p>
        <form onSubmit={onSubmit}>
          <label className={styles.field}>
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label className={styles.field}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <p className={styles.linkRow}>
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className={styles.hint}>
          No account? Ask your administrator for an invitation.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
