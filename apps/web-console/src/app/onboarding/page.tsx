"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { IdApiError, idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

import styles from "../login/login.module.css";

function slugFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "organization";
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingForm />
    </Suspense>
  );
}

function OnboardingFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    </div>
  );
}

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return") ?? "/aegis/traces";

  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  const suggestedSlug = useMemo(() => slugFromName(companyName), [companyName]);

  useEffect(() => {
    if (!slugTouched && companyName) {
      setSlug(suggestedSlug);
    }
  }, [companyName, suggestedSlug, slugTouched]);

  useEffect(() => {
    if (meQuery.isError) {
      router.replace(`/login?return=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (meQuery.isSuccess && meQuery.data) {
      if (!meQuery.data.needs_onboarding && !meQuery.data.organization.needs_onboarding) {
        router.replace(returnTo);
      }
    }
  }, [meQuery.isError, meQuery.isSuccess, meQuery.data, returnTo, router]);

  if (meQuery.isPending) {
    return <OnboardingFallback />;
  }

  async function signOutAndSwitchAccount() {
    setSigningOut(true);
    setError(null);
    try {
      await idApi<{ ok: boolean }>("/auth/logout", { method: "POST" });
      router.replace(`/login?return=${encodeURIComponent(returnTo)}`);
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi<{ ok: boolean }>("/auth/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          organization_name: companyName,
          organization_slug: slug.trim() || undefined,
        }),
      });
      router.replace(returnTo);
    } catch (err) {
      if (err instanceof IdApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Could not save organization");
      }
    } finally {
      setLoading(false);
    }
  }

  const email = meQuery.data?.account.email ?? "";

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Set up your organization"
        description="You signed in with Google or GitHub. Name your company workspace before using Aegis."
      />
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Company details</h2>
          <p className={styles.cardSub}>
            Signed in as <strong>{email}</strong>. This creates your tenant in Aegis (agents,
            policies, and audit data are scoped to this organization).
          </p>
          <form onSubmit={onSubmit}>
            <label className={styles.field}>
              <span>Company name</span>
              <input
                className={styles.input}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
                placeholder="Acme Inc"
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span>Organization URL</span>
              <input
                className={styles.input}
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                required
                minLength={2}
                maxLength={48}
                pattern="[a-z0-9][a-z0-9-]*"
                placeholder="acme-inc"
              />
            </label>
            <p className={styles.oauthHint} style={{ marginBottom: "1rem" }}>
              Used in API paths and your agent DID (
              <span className={styles.inlineCode}>did:salanor:{slug || "slug"}:…</span>). Letters,
              numbers, and hyphens only.
            </p>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button
              type="submit"
              className={styles.submit}
              disabled={loading || !companyName.trim() || !slug.trim()}
            >
              {loading ? "Saving…" : "Continue to Aegis"}
            </button>
          </form>
          <p className={styles.footer}>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={signingOut}
              onClick={() => void signOutAndSwitchAccount()}
            >
              {signingOut ? "Signing out…" : "Sign out and use another account"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
