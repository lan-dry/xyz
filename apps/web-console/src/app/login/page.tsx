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

type OAuthProviders = { google: boolean; github: boolean; sso: boolean };

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
  const oauthError = searchParams.get("oauth_error");

  const [email, setEmail] = useState(emailParam ?? "dev@salanor.local");
  const [password, setPassword] = useState("");
  const [ssoOrg, setSsoOrg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const providersQuery = useQuery({
    queryKey: ["id", "oauth-providers"],
    queryFn: () => idApi<OAuthProviders>("/auth/oauth/providers"),
    retry: false,
  });

  const providers = providersQuery.data;

  const session = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  useEffect(() => {
    if (oauthError) {
      const messages: Record<string, string> = {
        no_account:
          "No account for that Google or GitHub email. Use Create account, accept an invite, or ask your admin to enable self-serve signup.",
        pending_email_verification:
          "You already signed up with this email. Open the verification link we sent, then sign in with Google or GitHub.",
        no_membership:
          "Your account is not a member of that organization, or SSO is not enabled for the slug you entered.",
        sso_not_configured: "Enterprise SSO is not configured on this environment.",
        invalid_state: "Sign-in session expired or was invalid. Try Google, GitHub, or SSO again.",
        oauth_failed: "Sign-in with your provider failed. Try again or use email and password.",
        rate_limited: "Too many sign-in attempts. Wait about 15 minutes and try again.",
        missing_code: "Sign-in was interrupted. Start again from the login page.",
      };
      setError(messages[oauthError] ?? "Sign-in failed. Try email and password.");
    }
  }, [oauthError]);

  useEffect(() => {
    if (session.isSuccess && session.data?.user) {
      router.replace(returnTo);
    }
  }, [session.isSuccess, session.data, returnTo, router]);

  if (session.isPending || (session.isSuccess && session.data?.user)) {
    return <LoginFallback />;
  }

  function startOAuth(provider: "google" | "github") {
    const url = `/api/id/auth/oauth/${provider}/start?return=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
  }

  function startSso() {
    const slug = ssoOrg.trim().toLowerCase();
    if (!slug) {
      setError("Enter your organization slug for SSO (e.g. acme-corp).");
      return;
    }
    const url = `/api/id/auth/sso/start?org=${encodeURIComponent(slug)}&return=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
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

  const showSocial = providers && (providers.google || providers.github);
  const showSso = providers?.sso;

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
            Salanor ID · password, Google, GitHub, or enterprise SSO when enabled for your org.
          </p>

          {showSocial ? (
            <div className={styles.oauthBlock}>
              {providers.google ? (
                <button type="button" className={styles.oauthBtn} onClick={() => startOAuth("google")}>
                  Continue with Google
                </button>
              ) : null}
              {providers.github ? (
                <button type="button" className={styles.oauthBtn} onClick={() => startOAuth("github")}>
                  Continue with GitHub
                </button>
              ) : null}
              <p className={styles.oauthHint}>
                New here? Google or GitHub creates your account, then you name your company on the next
                screen. Existing password signup? Verify email first, then OAuth links to the same account.
              </p>
              <div className={styles.divider}>
                <span>or email and password</span>
              </div>
            </div>
          ) : null}

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

          {showSso ? (
            <div className={styles.ssoBlock}>
              <div className={styles.divider}>
                <span>enterprise SSO</span>
              </div>
              <label className={styles.field}>
                <span>Organization slug</span>
                <input
                  className={styles.input}
                  type="text"
                  value={ssoOrg}
                  onChange={(e) => setSsoOrg(e.target.value)}
                  placeholder="your-company"
                  autoComplete="organization"
                />
              </label>
              <button type="button" className={styles.oauthBtn} onClick={startSso}>
                Sign in with SSO (Okta / Azure AD)
              </button>
            </div>
          ) : null}

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
