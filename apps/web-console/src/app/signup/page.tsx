"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { idApi } from "../../lib/id-api";
import type { MeResponse } from "../../lib/types";

import styles from "../login/login.module.css";

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromOauth = searchParams.get("from") === "oauth";
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const session = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  useEffect(() => {
    if (session.isSuccess && session.data?.user) {
      router.replace("/aegis/traces");
    }
  }, [session.isSuccess, session.data, router]);

  if (session.isPending || (session.isSuccess && session.data?.user)) {
    return <SignupFallback />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi<{ ok: boolean; verify_required?: boolean; email?: string }>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            organization_name: orgName,
          }),
        },
      );
      router.replace(
        `/verify-email-sent?email=${encodeURIComponent(email.trim().toLowerCase())}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Start with Aegis"
        description="Create your organization, invite your team, and record signed AI activity from day one."
      />
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Create account</h2>
          <p className={styles.cardSub}>
            You become the org admin. Password at least 10 characters. We email a
            verification link before console access.
          </p>
          {fromOauth && email ? (
            <p className={styles.oauthHint}>
              No account for <strong>{email}</strong> yet. You can also use{" "}
              <Link href="/login">Sign in → Continue with GitHub/Google</Link> to create an account
              and name your company on the next screen.
            </p>
          ) : null}
          <form onSubmit={onSubmit}>
            <label className={styles.field}>
              <span>Company name</span>
              <input
                className={styles.input}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                placeholder="Acme Inc"
              />
            </label>
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
                minLength={10}
                autoComplete="new-password"
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Creating…" : "Create organization"}
            </button>
          </form>
          <p className={styles.footer}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
