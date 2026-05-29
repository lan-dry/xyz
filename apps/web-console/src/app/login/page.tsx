"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { IdApiError, idApi } from "../../lib/id-api";
import type { MeResponse } from "../../lib/types";

import styles from "./login.module.css";

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3001";

export default function PlatformLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <PlatformLoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    </div>
  );
}

function PlatformLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return") ?? "/aegis/traces";
  const emailParam = searchParams.get("email");

  const [email, setEmail] = useState(emailParam ?? "dev@salanor.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const session = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  useEffect(() => {
    if (session.isSuccess && session.data?.user) {
      router.replace(returnTo);
    }
  }, [session.isSuccess, session.data, returnTo, router]);

  if (session.isPending || (session.isSuccess && session.data?.user)) {
    return <LoginFallback />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi<MeResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace(returnTo);
    } catch (err) {
      if (err instanceof IdApiError && err.code === "email_unverified") {
        setError("Verify your email before signing in. Check your inbox or use the link we sent.");
      } else {
        const msg = err instanceof Error ? err.message : "Login failed";
        setError(
          returnTo.includes("/invite")
            ? `${msg} If you were invited, use the exact email on the invitation or create an account from the invite link.`
            : msg,
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Console for Aegis operators"
        description="Review signed events, manage policies, approve obligations, and export compliance bundles — one identity across Salanor products."
      />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Sign in</h2>
          <p className={styles.cardSub}>
            Salanor ID · dev: <code style={{ fontSize: "0.75rem" }}>dev@salanor.local</code> + password from{" "}
            <code style={{ fontSize: "0.75rem" }}>DEV_CONSOLE_PASSWORD_ORG_A</code> in <code style={{ fontSize: "0.75rem" }}>.env</code>
          </p>
          <form onSubmit={onSubmit}>
            <label className={styles.field}>
              <span>Work email</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className={styles.field}>
              <span>Password</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <p className={styles.forgotRow}>
              <Link href="/forgot-password">Forgot password?</Link>
            </p>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className={styles.footer}>
            {process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED === "1" ? (
              <>
                New company? <Link href="/signup">Create account</Link>
              </>
            ) : (
              <>
                No public registration yet — console accounts are provisioned after design partner
                onboarding.{" "}
                <a href={`${MARKETING_URL}/contact`}>Request access</a>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
